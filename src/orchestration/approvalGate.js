/**
 * vNext.13.1 — default-deny: 명시적 `authorized`만 외부 mutation 허용.
 * 필드 누락·null·pending_approval·draft_only → 거부.
 */

import { getExecutionRunById, updateRunExternalExecutionAuthorization } from '../features/executionRun.js';

/** @typedef {'authorized'|'pending_approval'|'draft_only'} ExternalExecutionAuthState */

/**
 * 오퍼레이터 전용 부트스트랩: 런 메타에만 쓰일 것 (창업자 출처와 혼용 금지).
 * @param {object|null|undefined} run
 * @returns {boolean}
 */
export function isOperatorExplicitAuthorizedBootstrapRun(run) {
  return (
    run?.operator_external_dispatch_bootstrap === true &&
    run?.founder_origin_run !== true &&
    run?.external_execution_authorization?.state === 'authorized'
  );
}

/**
 * @param {object|null|undefined} run
 * @returns {boolean}
 */
export function isExternalMutationAuthorized(run) {
  if (!run) return false;
  return run.external_execution_authorization?.state === 'authorized';
}

/**
 * @param {string} runId
 * @param {{ reason?: string }} [extra]
 * @returns {boolean}
 */
export function authorizeExternalExecutionForRun(runId, extra = {}) {
  return updateRunExternalExecutionAuthorization(runId, {
    state: 'authorized',
    reason: extra.reason || 'founder_approved',
    decided_at: new Date().toISOString(),
  });
}

/**
 * @param {string} runId
 * @param {{ reason?: string }} [extra]
 * @returns {boolean}
 */
export function setExternalExecutionPendingApproval(runId, extra = {}) {
  return updateRunExternalExecutionAuthorization(runId, {
    state: 'pending_approval',
    reason: extra.reason || 'awaiting_founder_approval',
    decided_at: new Date().toISOString(),
  });
}

/**
 * 창업자 보류: 외부 디스패치 없이 draft-only 유지.
 * @param {string} runId
 * @param {{ reason?: string }} [extra]
 * @returns {boolean}
 */
export function holdExternalExecutionForRun(runId, extra = {}) {
  return updateRunExternalExecutionAuthorization(runId, {
    state: 'draft_only',
    reason: extra.reason || 'founder_hold',
    decided_at: new Date().toISOString(),
  });
}

/**
 * 테스트·내부 도구용: 현재 런의 승인 상태 확인.
 * @param {string} runId
 * @returns {ExternalExecutionAuthState|string|null}
 */
export function getExternalExecutionAuthState(runId) {
  const run = getExecutionRunById(runId);
  const st = run?.external_execution_authorization?.state;
  if (st === undefined || st === null) return 'pending_approval';
  return st;
}
