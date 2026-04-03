/**
 * vNext.13 — 외부 상태 변경은 대표 승인(또는 명시적 authorized) 이후에만 디스패치 허용.
 * 기본값 `authorized`는 기존 런·회귀와의 호환(런 객체에 필드가 없으면 기존과 동일하게 진행).
 */

import { getExecutionRunById, updateRunExternalExecutionAuthorization } from '../features/executionRun.js';

/** @typedef {'authorized'|'pending_approval'|'draft_only'} ExternalExecutionAuthState */

/**
 * @param {object|null|undefined} run
 * @returns {boolean}
 */
export function isExternalMutationAuthorized(run) {
  const st = run?.external_execution_authorization?.state;
  if (st === undefined || st === null) return true;
  if (st === 'pending_approval') return false;
  if (st === 'draft_only') return false;
  return true;
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
 * 테스트·내부 도구용: 현재 런의 승인 상태 확인.
 * @param {string} runId
 * @returns {ExternalExecutionAuthState|string|null}
 */
export function getExternalExecutionAuthState(runId) {
  const run = getExecutionRunById(runId);
  return run?.external_execution_authorization?.state ?? 'authorized';
}
