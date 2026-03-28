/**
 * COS_TOOL_REGISTRY_V0 — 런타임 연결 (v1: 관측 + 읽기 전용 invoke + 고위험 구조화 진입 표시).
 * @see docs/cursor-handoffs/COS_NorthStar_Workflow_2026-03.md
 */

import { tryFinalizeSlackQueryRoute } from './queryOnlyRoute.js';
import { logRouterEvent } from './topLevelRouter.js';
import {
  getCosToolDescriptor,
  logCosToolRegistryBind,
} from './cosToolTelemetry.js';

/** @param {string} toolId */
export function describeToolApprovalPolicy(toolId) {
  const d = getCosToolDescriptor(toolId);
  if (!d) return null;
  return {
    id: d.id,
    risk: d.risk,
    autonomy: d.autonomy,
    gate_policy: d.gate_policy,
    pipeline: d.pipeline,
  };
}

/**
 * 레지스트리의 `plan_query` 와 동일 파이프 — 회귀·스크립트에서 단일 진입점으로 사용.
 * @param {string} trimmed
 * @param {{ raw_text: unknown, normalized_text: string }} routerCtx
 */
export async function invokePlanQueryTool(trimmed, routerCtx) {
  /** `tryFinalizeSlackQueryRoute` 가 `tool_registry_bind`(plan_query) 를 남긴다. */
  return tryFinalizeSlackQueryRoute(trimmed, routerCtx);
}

const WORK_DISPATCH_PREFIX_RE =
  /^(커서발행|이슈발행|깃허브발행|수파베이스발행|마이그레이션초안|정책초안|함수초안)\s/;

function matchesApprovalGateStructuredLine(t) {
  if (t.startsWith('승인대기')) return true;
  return /^(승인|보류|폐기)\s+APR-/i.test(t);
}

/**
 * `runInboundStructuredCommands` 맨 앞에서 한 번 호출 — 고위험·APR 계열 레지스트리 바인딩/게이트 로그.
 * 동작 변경 없음(차단하지 않음); North Star 게이트 매핑의 1단계.
 * @param {string} trimmed
 */
export function logStructuredCommandToolRegistry(trimmed) {
  const t = String(trimmed || '').trim();
  if (!t) return;

  if (matchesApprovalGateStructuredLine(t)) {
    logCosToolRegistryBind({
      tool_id: 'approval_gate',
      pipeline: 'structured_execute',
      match: 'approval_family',
    });
    return;
  }

  if (WORK_DISPATCH_PREFIX_RE.test(t)) {
    logCosToolRegistryBind({
      tool_id: 'work_dispatch',
      pipeline: 'structured_execute',
      match: 'dispatch_family',
    });
    logRouterEvent('tool_registry_gate', {
      tool_id: 'work_dispatch',
      gate_policy: 'high_risk_execute',
      decision: 'proceed_structured_commands',
    });
  }
}
