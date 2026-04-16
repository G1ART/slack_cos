/**
 * W7-B — Tool lane qualification (SSOT).
 *
 * 기존 API(`toolLaneReadiness.getAdapterReadiness` / `externalToolLaneRegistry.classifyToolInvocationPrecheck`)
 * 는 그대로 두고, 이 모듈은 **roll-up 자격** 만 추가한다:
 *   - readiness(live vs artifact 가능성)
 *   - 최신 precheck 가 남긴 실패 분류(W5-A resolution_class)
 *   - human_gate_required mirror (surface 모델/active_project_space 에서 관찰된 값)
 *
 * 본 모듈은 **Slack 송신 경로를 만들지 않는다.** 또 시크릿 값을 노출하지 않는다 — 반환은 항상
 * tool 이름 / 상태 / 사유 문구(자연어) 로만 구성된다.
 */

import {
  getAllAdapterReadiness,
  formatAdapterReadinessOneLine,
} from './toolLaneReadiness.js';
import {
  listExternalToolLanes,
  resolveLaneStaticResolutionClass,
} from './externalToolLaneRegistry.js';
import {
  FAILURE_RESOLUTION_CLASSES,
  buildFailureClassification,
  classifyLegacyBlockedSignal,
  deriveHumanGateRequiredFromClass,
} from '../failureTaxonomy.js';

/**
 * @typedef {Object} ToolLaneQualification
 * @property {string} tool
 * @property {boolean} declared
 * @property {boolean} live_capable
 * @property {boolean} configured
 * @property {string} reason
 * @property {string[]} missing
 * @property {string | null} latest_precheck_resolution_class — roll-up from latest blocked precheck, if any
 * @property {boolean} human_gate_required_mirror
 * @property {string | null} human_gate_reason
 * @property {string | null} human_gate_action
 */

const VALID_RESOLUTION_SET = new Set(FAILURE_RESOLUTION_CLASSES);

/** @param {unknown} v */
function stringOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Build a per-lane qualification view. Readiness 는 환경에서 뽑고, precheck 는 선택적으로
 * 호출자가 넘긴 `latest_precheck_by_tool` 맵에서 roll-up 한다(없으면 null).
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   latest_precheck_by_tool?: Record<string, { blocked?: unknown, blocked_reason?: unknown, next_required_input?: unknown, failure_classification?: unknown }>,
 *   surface_model?: { human_gate_required?: unknown, human_gate_reason?: unknown, human_gate_action?: unknown } | null,
 *   threadKey?: string,
 * }} [input]
 * @returns {Promise<ToolLaneQualification[]>}
 */
export async function buildToolLaneQualifications(input = {}) {
  const env = input.env || process.env;
  const threadKey = input.threadKey || '';
  const latestMap = input.latest_precheck_by_tool || {};
  const sm = input.surface_model || null;
  const humanGateRequired = sm && sm.human_gate_required === true;
  const humanGateReason = sm ? stringOrNull(sm.human_gate_reason) : null;
  const humanGateAction = sm ? stringOrNull(sm.human_gate_action) : null;

  const readiness = await getAllAdapterReadiness(env, { threadKey });

  /** @type {ToolLaneQualification[]} */
  const out = [];
  for (const r of readiness) {
    const pre = latestMap[r.tool];
    /** @type {string | null} */
    let latest_precheck_resolution_class = null;

    if (pre && pre.blocked === true && typeof pre.blocked_reason === 'string' && pre.blocked_reason.trim()) {
      const provided = pre.failure_classification && typeof pre.failure_classification === 'object'
        ? /** @type {Record<string, unknown>} */ (pre.failure_classification).resolution_class
        : null;
      if (typeof provided === 'string' && VALID_RESOLUTION_SET.has(provided)) {
        latest_precheck_resolution_class = provided;
      } else {
        const staticHint = resolveLaneStaticResolutionClass(r.tool, pre.blocked_reason);
        const heuristic = classifyLegacyBlockedSignal({
          blocked_reason: pre.blocked_reason,
          next_required_input: typeof pre.next_required_input === 'string' ? pre.next_required_input : null,
          hint_class: staticHint,
        });
        // sanity: run through buildFailureClassification to normalize (and to keep shape
        // identical to W5-A SSOT outputs downstream).
        const fc = buildFailureClassification({
          resolution_class: heuristic,
          human_gate_reason: pre.blocked_reason,
          human_gate_action: null,
        });
        if (fc && typeof fc.resolution_class === 'string' && VALID_RESOLUTION_SET.has(fc.resolution_class)) {
          latest_precheck_resolution_class = fc.resolution_class;
        }
      }
    }

    out.push({
      tool: String(r.tool || ''),
      declared: Boolean(r.declared),
      live_capable: Boolean(r.live_capable),
      configured: Boolean(r.configured),
      reason: String(r.reason || ''),
      missing: Array.isArray(r.missing) ? r.missing.map((x) => String(x)).slice(0, 8) : [],
      latest_precheck_resolution_class,
      human_gate_required_mirror:
        humanGateRequired === true ||
        (latest_precheck_resolution_class
          ? deriveHumanGateRequiredFromClass(latest_precheck_resolution_class)
          : false),
      human_gate_reason: humanGateReason,
      human_gate_action: humanGateAction,
    });
  }

  // 레인 레지스트리 선언과 readiness 가 일관된지 정렬 — declared 만 먼저
  out.sort((a, b) => {
    if (a.declared !== b.declared) return a.declared ? -1 : 1;
    return a.tool.localeCompare(b.tool);
  });

  return out;
}

/**
 * 내부 read_execution_context 용 compact 한 줄 문자열.
 * 시크릿·원시 reason 을 그대로 쏟지 않는다(자연어 문구는 tool별 formatter 에 위임).
 *
 * @param {ToolLaneQualification[]} quals
 * @param {number} [max]
 */
export function formatToolQualificationSummaryLines(quals, max = 8) {
  /** @type {string[]} */
  const out = [];
  for (const q of quals) {
    const oneLine = formatAdapterReadinessOneLine({
      tool: q.tool,
      live_capable: q.live_capable,
      reason: q.reason,
      details: {},
    });
    let line = oneLine;
    if (q.latest_precheck_resolution_class) {
      // founder 표면으로 토큰을 그대로 내보내면 안 되지만, 이 함수 결과는 내부 read_execution_context
      // slice 로만 들어간다. 그래도 방어선으로 압축 tag 형태로만 덧붙인다.
      line += ` · class=${q.latest_precheck_resolution_class}`;
    }
    if (q.human_gate_required_mirror) {
      line += ' · gate';
    }
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   latest_precheck_by_tool?: Record<string, unknown>,
 *   surface_model?: unknown,
 *   threadKey?: string,
 *   max?: number,
 * }} [input]
 */
export async function buildToolQualificationSummaryLines(input = {}) {
  const quals = await buildToolLaneQualifications({
    env: input.env,
    latest_precheck_by_tool: /** @type {Record<string, { blocked?: unknown, blocked_reason?: unknown, next_required_input?: unknown, failure_classification?: unknown }>} */ (
      input.latest_precheck_by_tool || {}
    ),
    surface_model: /** @type {{ human_gate_required?: unknown, human_gate_reason?: unknown, human_gate_action?: unknown } | null} */ (
      input.surface_model || null
    ),
    threadKey: input.threadKey || '',
  });
  return formatToolQualificationSummaryLines(quals, input.max || 8);
}

/** preserve existing public lane list for diagnostics */
export function listQualifiableLaneNames() {
  return listExternalToolLanes().map((l) => String(l.tool || ''));
}
