/**
 * 조회 명령 접두·토큰 파싱 — `queryOnlyRoute`·`queryNavButtons` 공유 (순환 import 방지).
 */

/** @typedef {'plan_detail'|'plan_progress'|'plan_dispatch_list'|'work_detail'|'work_review'} QueryRouteKind */

export const PREFIX_KIND = /** @type {const} */ ({
  계획발행목록: 'plan_dispatch_list',
  계획상세: 'plan_detail',
  계획진행: 'plan_progress',
  업무상세: 'work_detail',
  업무검토: 'work_review',
});

/** 긴 접두사 우선 (계획발행목록 등) */
export const QUERY_PREFIXES = Object.keys(PREFIX_KIND).sort((a, b) => b.length - a.length);

/** @param {string} trimmed */
export function matchQueryCommandPrefix(trimmed) {
  const t = String(trimmed || '');
  for (const p of QUERY_PREFIXES) {
    if (t.startsWith(p)) return p;
  }
  return null;
}

export function parseCommandToken(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '')
    .trim()
    .match(new RegExp(`^${escaped}\\s*([^\\s]+)`));
  if (!match) return null;
  return match[1];
}
