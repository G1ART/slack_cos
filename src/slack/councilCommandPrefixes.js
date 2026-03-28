/**
 * Council 명시 진입 접두 — app 라우터와 회귀 하네스가 동일 목록을 쓰도록 단일화.
 */

export const COUNCIL_COMMAND_PREFIXES = ['협의모드:', '협의모드 ', '매트릭스셀:', '관점추가 '];

/** @param {string} text */
export function isCouncilCommand(text) {
  const t = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return COUNCIL_COMMAND_PREFIXES.some((prefix) => t.startsWith(prefix));
}
