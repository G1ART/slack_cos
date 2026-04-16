/**
 * W8-B — env/secret propagation plan builder.
 *
 * 정본: docs/cursor-handoffs/W8_W10_LIVE_AUTOMATION_AND_PROOF_ARCHITECTURE_2026-04-16.md §W8 Required entities.
 *
 * 순수 함수: BindingRequirement[] + existingBindings + sinkCapabilities → PropagationPlan.
 * 값(secret) 저장 금지 — plan 은 "어떤 이름이 어디로 가야 하는지" 만 기술한다.
 *
 * sinkCapabilities:
 *   {
 *     'github':   { supports_secret_write: true,  supports_read_back: false },
 *     'vercel':   { supports_secret_write: true,  supports_read_back: false },
 *     'railway':  { supports_secret_write: true,  supports_read_back: false },
 *     'supabase': { supports_secret_write: false, supports_read_back: false }, // Management API 미보유 가정
 *   }
 *
 * verification_kind 선택 규칙:
 *   - supports_read_back      → 'read_back'
 *   - supports_secret_write   → 'smoke'
 *   - 그 외                    → 'none' (human gate 로 redirect)
 */

import crypto from 'node:crypto';
import { SECRET_HANDLING_MODES } from './bindingRequirements.js';

function asString(v) {
  return v == null ? '' : String(v);
}

function capOf(sinkCapabilities, sink) {
  const map = sinkCapabilities && typeof sinkCapabilities === 'object' ? sinkCapabilities : {};
  const row = map[sink];
  return {
    supports_secret_write: !!(row && row.supports_secret_write),
    supports_read_back: !!(row && row.supports_read_back),
  };
}

/**
 * @typedef {Object} PropagationStep
 * @property {number} step_index
 * @property {string} binding_requirement_kind
 * @property {string} source_system
 * @property {string} sink_system
 * @property {string} secret_handling_mode
 * @property {string|null} binding_name
 * @property {'read_back'|'smoke'|'none'} verification_kind
 * @property {string|null} required_human_action
 */

/**
 * @typedef {Object} PropagationPlan
 * @property {string} project_space_key
 * @property {PropagationStep[]} steps
 * @property {string} plan_hash
 * @property {string[]} missing_source_values_names  // 사람이 채워야 하는 NAME 목록
 */

/**
 * @param {{
 *   project_space_key: string,
 *   requirements: import('./bindingRequirements.js').BindingRequirement[],
 *   existingBindings?: Array<Record<string, unknown>>,
 *   sinkCapabilities?: Record<string, { supports_secret_write?: boolean, supports_read_back?: boolean }>,
 * }} input
 * @returns {PropagationPlan}
 */
export function buildPropagationPlan(input) {
  const project_space_key = asString(input.project_space_key).trim();
  if (!project_space_key) throw new Error('buildPropagationPlan: project_space_key required');
  const requirements = Array.isArray(input.requirements) ? input.requirements : [];
  const existingBindings = Array.isArray(input.existingBindings) ? input.existingBindings : [];
  const sinkCapabilities = input.sinkCapabilities || {};

  const bindingIndex = new Map();
  for (const b of existingBindings) {
    const kind = asString(b.binding_kind);
    if (!bindingIndex.has(kind)) bindingIndex.set(kind, []);
    bindingIndex.get(kind).push(b);
  }

  /** @type {PropagationStep[]} */
  const steps = [];
  const missingNames = new Set();
  let idx = 0;
  for (const r of requirements) {
    if (!SECRET_HANDLING_MODES.includes(r.secret_handling_mode)) {
      throw new Error(
        `buildPropagationPlan: invalid secret_handling_mode for step ${idx}: ${r.secret_handling_mode}`,
      );
    }
    const cap = capOf(sinkCapabilities, r.sink_system);
    let verification_kind = 'none';
    if (cap.supports_read_back) verification_kind = 'read_back';
    else if (cap.supports_secret_write) verification_kind = 'smoke';

    // env_requirement 는 NAME 이 반드시 있어야 하며, 없으면 missing 으로 분류
    if (r.binding_kind === 'env_requirement' && !r.binding_name) {
      missingNames.add(`(unnamed env for ${r.sink_system})`);
    } else if (r.binding_kind === 'env_requirement' && r.binding_name) {
      // 매칭 binding 이 없으면 missing_source_values 로 surfaced (이름만)
      const existing = bindingIndex.get('env_requirement') || [];
      const haveIt = existing.some((b) =>
        asString(b.binding_ref).toLowerCase().includes(asString(r.binding_name).toLowerCase()),
      );
      if (!haveIt) missingNames.add(r.binding_name);
    }

    steps.push(
      Object.freeze({
        step_index: idx,
        binding_requirement_kind: r.binding_kind,
        source_system: r.source_system,
        sink_system: r.sink_system,
        secret_handling_mode: r.secret_handling_mode,
        binding_name: r.binding_name || null,
        verification_kind,
        required_human_action: r.required_human_action || null,
      }),
    );
    idx += 1;
  }

  const canonical = JSON.stringify({
    project_space_key,
    steps: steps.map((s) => ({ ...s })),
  });
  const plan_hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);

  return Object.freeze({
    project_space_key,
    steps,
    plan_hash,
    missing_source_values_names: [...missingNames].sort(),
  });
}
