/**
 * 헌법 §6.1 금지 목록 파싱 + 출력 스캔 — npm test 전용. 프로덕션 런타임은 사용하지 않는다.
 */

/** @param {string} md */
export function parseForbiddenPhrasesFromConstitution(md) {
  const anchor = '## 6.1 founder 경로에서 금지되는 것';
  const start = md.indexOf(anchor);
  if (start === -1) return [];
  const rest = md.slice(start);
  const next = rest.indexOf('\n## ', anchor.length);
  const section = next === -1 ? rest : rest.slice(0, next);
  const out = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out.filter(Boolean);
}

/** 공백·대소문자·구두점 완화 후 비교용 */
export function normalizeTextForForbiddenScan(s) {
  let t = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s]*[.,:;!?'"()[\]{}—–-]+[\s]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** 한글·라틴 공백 제거 버전 */
export function compactForForbiddenScan(s) {
  return normalizeTextForForbiddenScan(s).replace(/\s/g, '');
}

/**
 * @param {string} text
 * @param {string[]} forbidden
 * @returns {string|null} matched phrase or null
 */
export function findForbiddenInText(text, forbidden) {
  const raw = String(text || '');
  const t1 = normalizeTextForForbiddenScan(raw);
  const t2 = compactForForbiddenScan(raw);
  for (const f of forbidden) {
    if (!f) continue;
    if (raw.includes(f)) return f;
    const n1 = normalizeTextForForbiddenScan(f);
    const n2 = compactForForbiddenScan(f);
    if (n1 && t1.includes(n1)) return f;
    if (n2 && t2.includes(n2)) return f;
  }
  return null;
}
