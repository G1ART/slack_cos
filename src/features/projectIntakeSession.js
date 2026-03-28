/**
 * 킥오프(`start_project`) 직후 **sticky 인테이크 세션** — 버퍼/전사가 비어도
 * 후속 턴이 Council·dialog로 새지 않도록 런타임 소유권을 고정한다.
 */

import { buildSlackThreadKey } from './slackConversationBuffer.js';

/** @typedef {{ stage: 'active'|'completed', goalLine: string, openedAt: string, updatedAt: string }} ProjectIntakeSession */

/** @type {Map<string, ProjectIntakeSession>} */
const sessions = new Map();

/**
 * @param {Record<string, unknown>} metadata
 * @param {{ goalLine: string }} payload
 */
export function openProjectIntakeSession(metadata, payload) {
  if (!metadata || typeof metadata !== 'object') return;
  const goalLine = String(payload?.goalLine || '').trim();
  if (!goalLine) return;
  const key = buildSlackThreadKey(metadata);
  const now = new Date().toISOString();
  sessions.set(key, {
    stage: 'active',
    goalLine,
    openedAt: now,
    updatedAt: now,
  });
}

/** @param {Record<string, unknown>} metadata */
export function getProjectIntakeSession(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return sessions.get(buildSlackThreadKey(metadata)) || null;
}

/** @param {Record<string, unknown>} metadata */
export function isActiveProjectIntake(metadata) {
  const s = getProjectIntakeSession(metadata);
  return Boolean(s && s.stage === 'active');
}

/** @param {Record<string, unknown>} metadata */
export function touchProjectIntakeSession(metadata) {
  const s = getProjectIntakeSession(metadata);
  if (!s || s.stage !== 'active') return;
  s.updatedAt = new Date().toISOString();
}

/** @param {Record<string, unknown>} metadata */
export function completeProjectIntakeSession(metadata) {
  const s = getProjectIntakeSession(metadata);
  if (!s) return;
  s.stage = 'completed';
  s.updatedAt = new Date().toISOString();
}

/** 테스트 전용 */
export function clearProjectIntakeSessionsForTest() {
  sessions.clear();
}
