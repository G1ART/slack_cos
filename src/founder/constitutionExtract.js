/**
 * CONSTITUTION.md 에서 금지 구절 목록(§4.3 등)을 파싱해 런타임 egress 검사에 사용.
 * 소스에 금지 문자열 리터럴을 중복 나열하지 않기 위함(vNext.13.16).
 */

/**
 * @param {string} md
 * @returns {string[]}
 */
export function extractForbiddenPhrasesFromConstitution(md) {
  const start = md.indexOf('## 4.3 founder 경로에서 금지되는 것');
  if (start === -1) return [];
  const rest = md.slice(start);
  const next = rest.indexOf('\n## ', 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  const out = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out.filter(Boolean);
}

/**
 * @param {string} text
 * @param {string[]} forbidden
 * @returns {string|null} first match or null
 */
export function findForbiddenSubstring(text, forbidden) {
  const s = String(text || '');
  for (const f of forbidden) {
    if (!f) continue;
    if (s.includes(f)) return f;
  }
  return null;
}
