/**
 * W4 — Founder surface model (렌더 전 중간 표현).
 *
 * 역할: 내부 진실(활성 런 셸·read-model·최근 아티팩트·recent turns)과 COS 모델 답변 후보를
 * founder-facing Slack 표면에 쓸 수 있는 **경계 잡힌 구조**로 변환한다. 이 파일은 **렌더 입력**만
 * 만들고, 실제 텍스트 조립은 `founderSurfaceRenderer.js` 가 담당한다.
 *
 * 금지: workflow 엔진·의도 분류·콜백/패킷 내부 용어 누수·가짜 완료 (CONSTITUTION §2, §6; WHAT 비협상).
 */

/**
 * @typedef {'accepted'|'running'|'blocked'|'review_required'|'completed'|'failed'|'informational'} FounderSurfaceIntent
 */

export const FOUNDER_SURFACE_INTENTS = /** @type {FounderSurfaceIntent[]} */ ([
  'accepted',
  'running',
  'blocked',
  'review_required',
  'completed',
  'failed',
  'informational',
]);

const SURFACE_INTENT_SET = new Set(FOUNDER_SURFACE_INTENTS);

/**
 * 활성 런 shell 의 `status` 문자열을 표면 의도로 매핑. ambiguous/unknown 은 `informational`.
 * C2(가짜 완료 금지)를 따라, `completed`/`succeeded`/`closed` 만 `completed` 로 올린다.
 *
 * @param {unknown} shell
 * @returns {FounderSurfaceIntent | null}
 */
export function deriveSurfaceIntentFromActiveRunShell(shell) {
  if (!shell || typeof shell !== 'object') return null;
  const sh = /** @type {Record<string, unknown>} */ (shell);
  const status = String(sh.status || '').trim().toLowerCase();
  if (!status) return null;

  if (status === 'failed' || status === 'error' || status === 'errored') return 'failed';
  if (status === 'completed' || status === 'succeeded' || status === 'closed' || status === 'done') return 'completed';
  if (status === 'review_required' || status === 'needs_review') return 'review_required';
  if (status === 'blocked') return 'blocked';
  if (
    status === 'running' ||
    status === 'dispatched' ||
    status === 'in_progress' ||
    status === 'pending' ||
    status === 'callback_pending'
  ) {
    return 'running';
  }
  if (status === 'accepted' || status === 'queued' || status === 'preallocated') return 'accepted';
  return null;
}

/**
 * W4 closeout Gap A — workcell_runtime 가 부정 상태(failed/blocked/escalated/review_required/rework_requested)
 * 를 들고 있으면 **무조건** 그 신호가 shell 의 `completed` 등을 덮는다 (truth > shell > prose).
 *
 * W2-B 실제 shape 의 상태 토큰 (`active|review_required|rework_requested|escalated|completed`) 과
 * 레거시 토큰 (`blocked`, `failed`) 을 모두 받아서 founder surface intent 로 매핑한다.
 *
 * @param {unknown} shell
 * @returns {FounderSurfaceIntent | null}
 */
function workcellIntentOverrideForShell(shell) {
  if (!shell || typeof shell !== 'object') return null;
  const wr = /** @type {Record<string, unknown>} */ (shell).workcell_runtime;
  if (!wr || typeof wr !== 'object' || Array.isArray(wr)) return null;
  const wrObj = /** @type {Record<string, unknown>} */ (wr);
  const ws = String(wrObj.status || '').trim().toLowerCase();
  if (ws === 'failed') return 'failed';
  if (ws === 'blocked') return 'blocked';
  if (ws === 'escalated') return 'blocked';
  if (ws === 'review_required') return 'review_required';
  if (ws === 'rework_requested') return 'review_required';
  if (wrObj.escalation_open === true) return 'blocked';
  return null;
}

/**
 * W4 closeout Gap A — deterministic precedence for founder surface intent:
 *
 *   1) workcell_runtime negative truth ({failed,blocked,escalated,review_required,rework_requested,
 *      escalation_open:true}) 이 있으면 그게 우선 (shell 의 `completed` 를 절대 덮지 못하게 차단).
 *   2) 그 외에는 active_run_shell.status.
 *   3) 앞 둘이 비었을 때만 호출자 hint.
 *   4) 최종 fallback 은 `informational`.
 *
 * @param {{
 *   activeRunShell?: unknown,
 *   surfaceIntentHint?: FounderSurfaceIntent | null,
 * }} p
 * @returns {FounderSurfaceIntent}
 */
export function resolveFounderSurfaceIntent(p) {
  const shell = p ? p.activeRunShell : null;
  const workcellOverride = workcellIntentOverrideForShell(shell);
  if (workcellOverride) return workcellOverride;

  const fromShell = deriveSurfaceIntentFromActiveRunShell(shell);
  if (fromShell) return fromShell;

  const hint = p && p.surfaceIntentHint && SURFACE_INTENT_SET.has(p.surfaceIntentHint) ? p.surfaceIntentHint : null;
  if (hint) return hint;

  return 'informational';
}

/**
 * @param {unknown} v
 * @param {number} maxLen
 */
function compactString(v, maxLen) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const cap = Math.max(1, Math.min(2000, maxLen || 240));
  return s.length > cap ? s.slice(0, cap - 1) + '…' : s;
}

/** founder 표면에는 machine 토큰(run_id, packet_id, emit_patch, lease 등)을 노출하지 않는다. */
const FOUNDER_SURFACE_JARGON_DENYLIST = [
  'run_id',
  'packet_id',
  'dispatch_id',
  'emit_patch',
  'lease',
  'callback',
  'webhook',
  'tool_result',
  'tool_invocation',
  'harness_dispatch',
  'harness_packet',
  'invoke_external_tool',
  'create_spec',
  'live_patch',
];

/**
 * W2-B `formatHarnessWorkcellSummaryLines` 가 생성하는 구조화 헤더 줄(`workcell:`, `packet ...`,
 * `review checkpoints:`, `escalation open:`, `escalation targets:`) 은 founder 표면에 그대로 드러내지
 * 않는다. 자연어 줄과 구분하려고 전용 regex 로 차단한다.
 */
const WORKCELL_SUMMARY_STRUCTURED_LINE_RE =
  /(^|\s)(workcell:|packet\s+\S+:\S+|review checkpoints:|escalation open:|escalation targets:)/i;

/**
 * snake_case 토큰·W2-B 구조화 summary 헤더·`key=value` 파편 이 들어간 문자열은 founder 표면에 쓰지 않는다.
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeRuntimeJargon(s) {
  const t = ` ${String(s || '')} `;
  if (/(^|\s)[a-z][a-z0-9]*(_[a-z0-9]+){1,}(\s|[:.,]|$)/.test(t)) return true;
  if (WORKCELL_SUMMARY_STRUCTURED_LINE_RE.test(t)) return true;
  if (/\b(tool|action|personas|packets|packet_count|review_checkpoint_count)\s*=/.test(t)) return true;
  for (const kw of FOUNDER_SURFACE_JARGON_DENYLIST) {
    if (t.includes(kw)) return true;
  }
  return false;
}

/**
 * @param {string} p
 */
function basenameOfPath(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  const normalized = s.replace(/[\\]+/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

/**
 * 최근 아티팩트에서 **실제로 존재하는** 산출물만 뽑는다. `artifact_path` 가 있는 tool_result 를 우선한다.
 * 가짜 deliverable 금지 (WHAT Non-negotiable: "fabricate 금지").
 *
 * @param {unknown[]} artifacts
 * @param {number} maxItems
 * @returns {Array<{ label: string, detail?: string }>}
 */
function collectDeliverablesFromArtifacts(artifacts, maxItems) {
  const cap = Math.max(1, Math.min(8, maxItems || 4));
  const list = Array.isArray(artifacts) ? artifacts : [];
  /** @type {Array<{ label: string, detail?: string }>} */
  const out = [];
  const seen = new Set();
  for (let i = list.length - 1; i >= 0 && out.length < cap; i -= 1) {
    const row = list[i];
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const type = String(r.type || '');
    if (type !== 'tool_result') continue;
    const payload =
      r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
        ? /** @type {Record<string, unknown>} */ (r.payload)
        : null;
    if (!payload) continue;
    const ap = payload.artifact_path != null ? String(payload.artifact_path).trim() : '';
    if (!ap) continue;
    const label = basenameOfPath(ap);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const rs = payload.result_summary != null ? String(payload.result_summary).trim() : '';
    const detailRaw = rs && !looksLikeRuntimeJargon(rs) ? rs : '';
    out.push({
      label,
      ...(detailRaw ? { detail: compactString(detailRaw, 160) } : {}),
    });
  }
  return out;
}

/**
 * W4 closeout Gap C — founder-facing blocker/review reason 추출 우선순위.
 *
 *   1) 1차(primary): `workcell_runtime.summary_lines` 에서 jargon 이 아닌 자연어 줄 (W2-B 실제 shape).
 *   2) 2차(legacy compat): `workcell_runtime.escalation_state.reasons` 에서 자연어 사유.
 *
 * 둘 다 없으면 null 반환 — founder 표면에 machine 토큰을 절대 붙이지 않는다 (truth > prose).
 *
 * @param {unknown} shell
 * @returns {string | null}
 */
function pickFounderFacingReasonFromWorkcell(shell) {
  if (!shell || typeof shell !== 'object') return null;
  const wr = /** @type {Record<string, unknown>} */ (shell).workcell_runtime;
  if (!wr || typeof wr !== 'object' || Array.isArray(wr)) return null;
  const wrObj = /** @type {Record<string, unknown>} */ (wr);

  const lines = Array.isArray(wrObj.summary_lines) ? wrObj.summary_lines : [];
  for (const raw of lines) {
    const s = compactString(raw, 240);
    if (!s) continue;
    if (looksLikeRuntimeJargon(s)) continue;
    return s;
  }

  const es = wrObj.escalation_state;
  if (es && typeof es === 'object' && !Array.isArray(es)) {
    const esObj = /** @type {Record<string, unknown>} */ (es);
    const reasons = Array.isArray(esObj.reasons) ? esObj.reasons.map(String).filter(Boolean) : [];
    for (const r of reasons) {
      if (!r || looksLikeRuntimeJargon(r)) continue;
      return compactString(r, 240);
    }
  }

  return null;
}

/**
 * workcell summary lines 중 founder 표면에 쓸 수 있는 자연어 줄만 남긴다.
 * @param {unknown} readModel
 * @returns {string[]}
 */
function collectEvidenceFromReadModel(readModel) {
  if (!readModel || typeof readModel !== 'object') return [];
  const rm = /** @type {Record<string, unknown>} */ (readModel);
  const lines = Array.isArray(rm.workcell_summary_lines) ? rm.workcell_summary_lines : [];
  /** @type {string[]} */
  const out = [];
  for (const raw of lines) {
    const s = compactString(raw, 200);
    if (!s) continue;
    if (looksLikeRuntimeJargon(s)) continue;
    out.push(s);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * @param {unknown} shell
 * @param {unknown} readModel
 */
function resolveTenancySlice(shell, readModel) {
  /** @type {Record<string, string | null>} */
  const out = {
    workspace_key: null,
    product_key: null,
    project_space_key: null,
    parcel_deployment_key: null,
  };
  const rm = readModel && typeof readModel === 'object' ? /** @type {Record<string, unknown>} */ (readModel) : null;
  const rmSlice =
    rm && rm.tenancy_slice && typeof rm.tenancy_slice === 'object' && !Array.isArray(rm.tenancy_slice)
      ? /** @type {Record<string, unknown>} */ (rm.tenancy_slice)
      : null;
  const sh = shell && typeof shell === 'object' ? /** @type {Record<string, unknown>} */ (shell) : null;
  for (const k of Object.keys(out)) {
    const fromRm = rmSlice && rmSlice[k] != null ? String(rmSlice[k]).trim() : '';
    const fromShell = sh && sh[k] != null ? String(sh[k]).trim() : '';
    out[k] = fromRm || fromShell || null;
  }
  return out;
}

/**
 * W4 Slice A — 기초 surface model. Slice B/C 가 deliverables/evidence/문구를 채운다.
 *
 * @param {{
 *   threadKey?: string,
 *   modelText?: string,
 *   activeRunShell?: unknown,
 *   readModel?: unknown,
 *   artifacts?: unknown[],
 *   recentTurns?: unknown[],
 *   surfaceIntentHint?: FounderSurfaceIntent | null,
 * }} input
 */
export function buildFounderSurfaceModel(input = {}) {
  const threadKey = input.threadKey ? String(input.threadKey).trim() : '';
  const shell = input.activeRunShell;
  const tenancy = resolveTenancySlice(shell, input.readModel);

  const surface_intent = resolveFounderSurfaceIntent({
    activeRunShell: shell,
    surfaceIntentHint: input.surfaceIntentHint || null,
  });

  const naturalReason = pickFounderFacingReasonFromWorkcell(shell);
  /** @type {string | null} */
  let blocker_reason = null;
  /** @type {string | null} */
  let review_reason = null;
  if (naturalReason) {
    if (surface_intent === 'blocked' || surface_intent === 'failed') blocker_reason = naturalReason;
    if (surface_intent === 'review_required') review_reason = naturalReason;
  }

  const deliverables = collectDeliverablesFromArtifacts(input.artifacts || [], 4);
  const evidence_lines = collectEvidenceFromReadModel(input.readModel);

  return {
    surface_intent,
    title: '',
    concise_summary: '',
    next_step: '',
    blocker_reason,
    review_reason,
    deliverables,
    evidence_lines,
    thread_key: threadKey || null,
    workspace_key: tenancy.workspace_key,
    product_key: tenancy.product_key,
    project_space_key: tenancy.project_space_key,
    model_text_preview: compactString(input.modelText, 240),
  };
}
