/**
 * W12-B — Secret source-of-truth graph (pure builder).
 *
 * 정본: docs/cursor-handoffs/W12_LIVE_QUALIFICATION_AND_PACKAGING_PLANMODE_MASTER_INSTRUCTION_2026-04-16.md §3 Slice B.
 *
 * 순수 함수: BindingRequirement[] + existingBindings + qualifiedCapabilityLookup → SecretSourceGraph.
 *
 * 값(secret) / 토큰 / JWT / decrypted credential / credentialized URL 은 graph 에 절대 포함되지 않는다.
 * 오직 메타데이터만:
 *   value_name, source_kind, source_ref, source_read_mode,
 *   sink_targets: [{ sink_system, write_policy, verification_policy, manual_gate_required }],
 *   write_policy, verification_policy, manual_gate_required,
 *   redaction_policy: 'never_persist_value',
 *   selected_verification_mode, requires_human_gate
 */

import {
  getQualifiedCapabilityForSink,
  maxAllowedVerificationKind,
  isLiveWriteAllowed,
} from './liveBindingCapabilityRegistry.js';

export const GRAPH_VERSION = 'v1';

/**
 * @typedef {Object} SinkTarget
 * @property {string} sink_system
 * @property {'autowrite'|'human_gate_required'|'forbidden'} write_policy
 * @property {'read_back'|'smoke'|'existence_only'|'none'} verification_policy
 * @property {boolean} manual_gate_required
 *
 * @typedef {Object} SecretSourceNode
 * @property {string} value_name
 * @property {'operator_manual'|'provider_generated'|'upstream_binding'|'registry_default'} source_kind
 * @property {string} source_ref
 * @property {'read_back'|'write_only'|'existence_only'|'none'} source_read_mode
 * @property {SinkTarget[]} sink_targets
 * @property {'autowrite'|'human_gate_required'|'forbidden'} write_policy
 * @property {'read_back'|'smoke'|'existence_only'|'none'} verification_policy
 * @property {boolean} manual_gate_required
 * @property {'never_persist_value'} redaction_policy
 * @property {'read_back'|'smoke'|'existence_only'|'none'} selected_verification_mode
 * @property {boolean} requires_human_gate
 *
 * @typedef {Object} SecretSourceGraph
 * @property {string} graph_version
 * @property {string} project_space_key
 * @property {SecretSourceNode[]} values
 * @property {string} computed_at
 */

function asString(v) {
  return v == null ? '' : String(v);
}

/**
 * source_kind 를 requirement.source_system 기반으로 추정.
 *   operator | op | human → operator_manual
 *   그 외 외부 provider 이름 → provider_generated
 *   'cos' / 'upstream' / 'derived' → upstream_binding
 *   빈 값 → registry_default
 */
function deriveSourceKind(sourceSystem) {
  const s = asString(sourceSystem).toLowerCase();
  if (!s) return 'registry_default';
  if (['operator', 'op', 'human', 'founder'].includes(s)) return 'operator_manual';
  if (['cos', 'upstream', 'derived', 'internal'].includes(s)) return 'upstream_binding';
  return 'provider_generated';
}

function deriveSourceReadMode(existingBindings, bindingName) {
  const name = asString(bindingName).toLowerCase();
  if (!name) return 'none';
  const binds = Array.isArray(existingBindings) ? existingBindings : [];
  const match = binds.find((b) =>
    asString(b.binding_ref).toLowerCase().includes(name),
  );
  if (!match) return 'none';
  if (match.secret_handling_mode === 'plain_readable') return 'read_back';
  if (match.secret_handling_mode === 'smoke_only') return 'existence_only';
  if (match.secret_handling_mode === 'write_only') return 'write_only';
  return 'none';
}

function writePolicyForSink(qualifiedCap) {
  if (!qualifiedCap) return 'forbidden';
  if (qualifiedCap.can_write !== true) return 'forbidden';
  if (qualifiedCap.requires_manual_confirmation === true) return 'human_gate_required';
  if (isLiveWriteAllowed(qualifiedCap)) return 'autowrite';
  return 'human_gate_required';
}

function verificationPolicyForSink(qualifiedCap) {
  if (!qualifiedCap) return 'none';
  return maxAllowedVerificationKind(qualifiedCap);
}

/**
 * @param {{
 *   project_space_key: string,
 *   requirements: import('./bindingRequirements.js').BindingRequirement[],
 *   existingBindings?: Array<Record<string, unknown>>,
 *   qualifiedCapabilityLookup?: (sink: string) => any,
 *   now?: Date,
 * }} input
 * @returns {SecretSourceGraph}
 */
export function buildSecretSourceGraph(input) {
  const project_space_key = asString(input && input.project_space_key).trim();
  if (!project_space_key) throw new Error('buildSecretSourceGraph: project_space_key required');
  const requirements = Array.isArray(input.requirements) ? input.requirements : [];
  const existingBindings = Array.isArray(input.existingBindings) ? input.existingBindings : [];
  const capLookup =
    typeof input.qualifiedCapabilityLookup === 'function'
      ? input.qualifiedCapabilityLookup
      : (sink) => getQualifiedCapabilityForSink(sink);

  /** @type {Map<string, { req: any, sinks: Set<string> }>} */
  const groups = new Map();
  for (const r of requirements) {
    const name = r.binding_name ? String(r.binding_name) : `(unnamed:${r.binding_kind}:${r.sink_system})`;
    if (!groups.has(name)) {
      groups.set(name, { req: r, sinks: new Map() });
    }
    const g = groups.get(name);
    g.sinks.set(r.sink_system, r);
  }

  /** @type {SecretSourceNode[]} */
  const values = [];
  for (const [value_name, g] of groups) {
    const r = g.req;
    const source_kind = deriveSourceKind(r.source_system);
    const source_ref = asString(r.source_system);
    const source_read_mode = deriveSourceReadMode(existingBindings, r.binding_name);

    /** @type {SinkTarget[]} */
    const sinkTargets = [];
    let anyManualGate = false;
    /** @type {Array<'read_back'|'smoke'|'existence_only'|'none'>} */
    const verifModes = [];
    /** @type {Array<'autowrite'|'human_gate_required'|'forbidden'>} */
    const writeModes = [];
    for (const [sink_system, sinkReq] of g.sinks) {
      const cap = capLookup(sink_system);
      const write_policy = writePolicyForSink(cap);
      const verification_policy = verificationPolicyForSink(cap);
      const manual_gate_required =
        write_policy !== 'autowrite' || !!(cap && cap.requires_manual_confirmation);
      if (manual_gate_required) anyManualGate = true;
      writeModes.push(write_policy);
      verifModes.push(verification_policy);
      sinkTargets.push(
        Object.freeze({
          sink_system,
          write_policy,
          verification_policy,
          manual_gate_required,
        }),
      );
    }

    // aggregate: 가장 보수적인 write_policy 를 value 전체의 policy 로 승격
    let write_policy = 'forbidden';
    if (writeModes.every((w) => w === 'autowrite')) write_policy = 'autowrite';
    else if (writeModes.some((w) => w === 'autowrite' || w === 'human_gate_required')) {
      write_policy = 'human_gate_required';
    }

    // aggregate verification: 가장 약한 mode (none > existence_only > smoke > read_back)
    const weakestOrder = ['read_back', 'smoke', 'existence_only', 'none'];
    let verification_policy = 'none';
    for (const mode of verifModes) {
      if (weakestOrder.indexOf(mode) > weakestOrder.indexOf(verification_policy)) {
        verification_policy = mode;
      }
    }

    const requires_human_gate = anyManualGate || write_policy !== 'autowrite';
    const selected_verification_mode = verification_policy;

    values.push(
      Object.freeze({
        value_name,
        source_kind,
        source_ref,
        source_read_mode,
        sink_targets: Object.freeze(sinkTargets),
        write_policy,
        verification_policy,
        manual_gate_required: anyManualGate,
        redaction_policy: 'never_persist_value',
        selected_verification_mode,
        requires_human_gate,
      }),
    );
  }

  const computed_at =
    input && input.now instanceof Date ? input.now.toISOString() : new Date().toISOString();

  values.sort((a, b) => a.value_name.localeCompare(b.value_name));

  return Object.freeze({
    graph_version: GRAPH_VERSION,
    project_space_key,
    values: Object.freeze(values),
    computed_at,
  });
}

/**
 * audit-only compact lines. founder 본문으로 흐르지 않는다.
 * @param {SecretSourceGraph} graph
 * @returns {string[]}  최대 6줄
 */
export function formatSecretSourceGraphCompactLines(graph, { max = 6 } = {}) {
  if (!graph || !Array.isArray(graph.values) || graph.values.length === 0) return [];
  const lines = [];
  for (const v of graph.values) {
    if (lines.length >= max) break;
    const gate = v.requires_human_gate ? 'Y' : 'N';
    lines.push(
      `val=${v.value_name} src=${v.source_kind} sinks=${v.sink_targets.length} policy=${v.write_policy}|${v.verification_policy} gate=${gate}`,
    );
  }
  return lines;
}

/**
 * 그래프에 raw secret 값이 들어가지 않았는지 구조적으로 감시하는 guard.
 * - 값처럼 생긴 긴 base64/JWT/GitHub PAT/OpenAI key/URL 등을 탐지하면 true 반환.
 * @param {SecretSourceGraph} graph
 * @returns {string|null}  검출 시 설명 문자열, 없으면 null
 */
export function detectSecretLeakInGraph(graph) {
  const text = JSON.stringify(graph);
  const patterns = [
    [/ghp_[A-Za-z0-9]{20,}/, 'github_pat_like'],
    [/gho_[A-Za-z0-9]{20,}/, 'github_oauth_like'],
    [/ghu_[A-Za-z0-9]{20,}/, 'github_user_like'],
    [/sk-[A-Za-z0-9_\-]{20,}/, 'openai_key_like'],
    [/eyJ[A-Za-z0-9_\-.]{20,}/, 'jwt_like'],
    [/https?:\/\/\S+/i, 'full_url'],
    [/[A-Za-z0-9+/=]{80,}/, 'long_base64_like'],
  ];
  for (const [pat, label] of patterns) {
    if (pat.test(text)) return `secret_like_pattern:${label}`;
  }
  return null;
}
