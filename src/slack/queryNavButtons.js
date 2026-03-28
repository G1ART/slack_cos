/**
 * 조회 응답 하단 — 같은 PLN/WRK 로 이어질 수 있는 조회만 버튼으로 제공.
 * @see docs/cursor-handoffs/Query_Commands_Council_Free_handoff.md
 */

import { matchQueryCommandPrefix, parseCommandToken } from '../features/queryCommandPrefix.js';

/** Bolt `action_id` 접두 — `g1cos_query_nav_0` … (블록 내 유일성) */
export const QUERY_NAV_ACTION_ID_PREFIX = 'g1cos_query_nav_';

const PLAN_PREFIXES = /** @type {const} */ (['계획상세', '계획진행', '계획발행목록']);
const WORK_PREFIXES = /** @type {const} */ (['업무상세', '업무검토']);

const SHORT_LABEL = {
  계획상세: '계획 상세',
  계획진행: '계획 진행',
  계획발행목록: '발행 목록',
  업무상세: '업무 상세',
  업무검토: '업무 검토',
};

/**
 * @param {string} effectiveQueryLine `tryFinalize` 에 쓰인 조회 한 줄 (예: `계획상세 PLN-1`)
 * @returns {{ type: 'actions', block_id: string, elements: object[] } | null}
 */
export function buildQueryNavActionsBlock(effectiveQueryLine) {
  const off =
    process.env.SLACK_QUERY_NAV_BUTTONS === '0' || process.env.SLACK_QUERY_NAV_BUTTONS === 'false';
  if (off) return null;

  const line = String(effectiveQueryLine || '').trim();
  const prefix = matchQueryCommandPrefix(line);
  const token = prefix ? parseCommandToken(line, prefix) : null;
  if (!prefix || !token) return null;

  /** @type {{ label: string, queryLine: string }[]} */
  let targets = [];
  if (PLAN_PREFIXES.includes(/** @type {*} */ (prefix))) {
    for (const p of PLAN_PREFIXES) {
      if (p !== prefix) targets.push({ label: SHORT_LABEL[p] || p, queryLine: `${p} ${token}` });
    }
  } else if (WORK_PREFIXES.includes(/** @type {*} */ (prefix))) {
    for (const p of WORK_PREFIXES) {
      if (p !== prefix) targets.push({ label: SHORT_LABEL[p] || p, queryLine: `${p} ${token}` });
    }
  } else {
    return null;
  }

  if (targets.length === 0) return null;

  return {
    type: 'actions',
    block_id: 'g1cos_query_nav_actions',
    elements: targets.slice(0, 5).map((t, i) => ({
      type: 'button',
      text: { type: 'plain_text', text: t.label.slice(0, 72), emoji: true },
      action_id: `${QUERY_NAV_ACTION_ID_PREFIX}${i}`,
      value: t.queryLine.slice(0, 2000),
    })),
  };
}
