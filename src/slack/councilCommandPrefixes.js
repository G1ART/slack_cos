/**
 * Council 명시 진입 접두 — app 라우터와 회귀 하네스가 동일 목록을 쓰도록 단일화.
 */

export const COUNCIL_COMMAND_PREFIXES = ['협의모드:', '협의모드 ', '매트릭스셀:', '관점추가 '];

const LEADING_COUNCIL_STRIP_RES = [
  /^협의모드\s*[:：]\s*/u,
  /^협의모드\s+/u,
  /^매트릭스셀\s*[:：]\s*/u,
  /^관점추가\s+/u,
];

/**
 * 명시 Council 접두만 제거(한 번). `isCouncilCommand` 와 동일 계열 —
 * 본문이 `툴제작:` / 빌드 시그널이면 킥오프로 재분류할 때 사용.
 * @param {string} text
 * @returns {{ stripped: string, hadPrefix: boolean }}
 */
export function stripLeadingCouncilPrefix(text) {
  const raw = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!raw) return { stripped: '', hadPrefix: false };
  for (const re of LEADING_COUNCIL_STRIP_RES) {
    const next = raw.replace(re, '').trim();
    if (next !== raw) return { stripped: next, hadPrefix: true };
  }
  return { stripped: raw, hadPrefix: false };
}

/** @param {string} text */
export function isCouncilCommand(text) {
  const t = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return COUNCIL_COMMAND_PREFIXES.some((prefix) => t.startsWith(prefix));
}
