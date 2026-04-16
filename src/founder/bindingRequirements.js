/**
 * W8-A — Binding requirements SSOT.
 *
 * 정본: docs/cursor-handoffs/W8_W10_LIVE_AUTOMATION_AND_PROOF_ARCHITECTURE_2026-04-16.md §W8 Required entities/fields.
 *
 * project space 가 "되려면" 어떤 binding 이 있어야 하는가 를 기술(descriptive only).
 * - binding_kind: W5-B PROJECT_SPACE_BINDING_KINDS 재사용 (enum 신규 확장 금지).
 * - source_system/sink_system: 자유 문자열 slug (ex. 'github', 'vercel', 'railway', 'supabase').
 * - secret_handling_mode: plain_readable | write_only | smoke_only — sink 전략 결정.
 * - required_human_action: 사람이 꼭 해야 하는 동작(자연어; 값 금지).
 *
 * 값(secret) 저장 금지 — detectEnvValueLeak(projectSpaceLane.js) 로 guard.
 */

import { PROJECT_SPACE_BINDING_KINDS } from './projectSpaceBindingStore.js';
import { detectEnvValueLeak } from './toolPlane/lanes/projectSpaceLane.js';

export const BINDING_REQUIREMENT_KINDS = PROJECT_SPACE_BINDING_KINDS;

export const SECRET_HANDLING_MODES = Object.freeze([
  'plain_readable',
  'write_only',
  'smoke_only',
]);

function trimString(v) {
  return v == null ? '' : String(v).trim();
}

function ensureEnum(value, allowed, label) {
  const v = trimString(value);
  if (!allowed.includes(v)) {
    throw new Error(`invalid ${label}: ${v || '(empty)'} (expected one of ${allowed.join('|')})`);
  }
  return v;
}

/**
 * @typedef {Object} BindingRequirement
 * @property {string} project_space_key
 * @property {string} binding_kind
 * @property {string} source_system
 * @property {string} sink_system
 * @property {string} secret_handling_mode
 * @property {string|null} binding_name   // env var NAME or stable handle (값 아님!)
 * @property {string|null} required_human_action
 */

/**
 * @param {{
 *   project_space_key: string,
 *   binding_kind: string,
 *   source_system: string,
 *   sink_system: string,
 *   secret_handling_mode: string,
 *   binding_name?: string|null,
 *   required_human_action?: string|null,
 * }} input
 * @returns {BindingRequirement}
 */
export function buildBindingRequirement(input) {
  const project_space_key = trimString(input.project_space_key);
  if (!project_space_key) throw new Error('buildBindingRequirement: project_space_key required');
  const binding_kind = ensureEnum(input.binding_kind, BINDING_REQUIREMENT_KINDS, 'binding_kind');
  const source_system = trimString(input.source_system);
  if (!source_system) throw new Error('buildBindingRequirement: source_system required');
  const sink_system = trimString(input.sink_system);
  if (!sink_system) throw new Error('buildBindingRequirement: sink_system required');
  const secret_handling_mode = ensureEnum(
    input.secret_handling_mode,
    SECRET_HANDLING_MODES,
    'secret_handling_mode',
  );
  const binding_name = input.binding_name == null ? null : trimString(input.binding_name);
  if (binding_name) {
    if (binding_kind === 'env_requirement') {
      const leak = detectEnvValueLeak(binding_name);
      if (leak) throw new Error(`binding_requirement.binding_name rejected: ${leak}`);
    } else if (/\s/.test(binding_name)) {
      throw new Error('binding_requirement.binding_name must not contain whitespace');
    } else if (binding_name.length > 96) {
      throw new Error('binding_requirement.binding_name must be <= 96 chars');
    }
  }
  const required_human_action =
    input.required_human_action == null ? null : trimString(input.required_human_action) || null;

  return Object.freeze({
    project_space_key,
    binding_kind,
    source_system,
    sink_system,
    secret_handling_mode,
    binding_name: binding_name || null,
    required_human_action,
  });
}

/**
 * requirement vs existing bindings 를 missing/satisfied/stale 로 분류.
 * - satisfied: requirement 의 (binding_kind, binding_name?) 와 매칭되는 binding 이 최소 1개 존재.
 * - missing: 매칭 binding 0개.
 * - stale: binding 은 있지만 sink_system / binding_name 이 불일치 (heuristic: binding_ref 에 binding_name 을 포함하지 않음).
 *
 * @param {BindingRequirement[]} requirements
 * @param {Array<Record<string, unknown>>} bindings  project_space_bindings rows
 */
export function diffRequirementsVsBindings(requirements, bindings) {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const binds = Array.isArray(bindings) ? bindings : [];
  const missing = [];
  const satisfied = [];
  const stale = [];
  for (const r of reqs) {
    const sameKind = binds.filter((b) => String(b.binding_kind || '') === r.binding_kind);
    if (sameKind.length === 0) {
      missing.push(r);
      continue;
    }
    const name = r.binding_name ? String(r.binding_name) : '';
    if (!name) {
      satisfied.push(r);
      continue;
    }
    const nameMatch = sameKind.find((b) =>
      String(b.binding_ref || '')
        .toLowerCase()
        .includes(name.toLowerCase()),
    );
    if (nameMatch) {
      satisfied.push(r);
    } else {
      stale.push(r);
    }
  }
  return { missing, satisfied, stale };
}
