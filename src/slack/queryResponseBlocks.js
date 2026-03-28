/**
 * 조회(query) 응답용 Block Kit — 가독성·모바일 줄바꿈 (North Star 다음 패치).
 * `tryFinalizeSlackQueryRoute` 최종 문자열을 section mrkdwn 블록으로 쪼갠다.
 *
 * 비활성: `SLACK_QUERY_BLOCKS=0` 또는 `false`
 * 관련 조회 버튼: `queryNavButtons.js` — `SLACK_QUERY_NAV_BUTTONS=0` 으로 끔
 */

import { buildQueryNavActionsBlock } from './queryNavButtons.js';

const MAX_MRKTW = 2900;
const MAX_BLOCKS = 45;

/**
 * @param {unknown} p
 * @returns {string}
 */
export function inboundPayloadPlainText(p) {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  if (typeof p === 'object' && p.text != null) return String(p.text);
  return String(p);
}

/**
 * finalize 이후 문자열을 그대로 두거나 `{ text, blocks }` 로 감싼다.
 * @param {string} plainText `finalizeSlackResponse` 결과
 * @param {{ effectiveQueryLine?: string }} [opts] PLN/WRK 이어짐 버튼용 원문 조회 줄
 * @returns {string | { text: string, blocks: object[] }}
 */
export function wrapQueryFinalizePlainText(plainText, opts = {}) {
  const plain = String(plainText ?? '');
  const blocksOff = process.env.SLACK_QUERY_BLOCKS === '0' || process.env.SLACK_QUERY_BLOCKS === 'false';

  /** @type {object[]} */
  let blocks = [];
  if (!blocksOff) {
    const sections = splitPlainIntoMrkdwnSections(plain);
    if (sections.length > 0) {
      blocks = sections.map((t) => ({
        type: 'section',
        text: { type: 'mrkdwn', text: t },
      }));
    }
  }

  const nav = buildQueryNavActionsBlock(opts.effectiveQueryLine);
  if (nav) blocks.push(nav);

  if (blocks.length === 0) return plain;
  return { text: plain, blocks };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitPlainIntoMrkdwnSections(text) {
  const raw = String(text || '').trimEnd();
  if (!raw) return [];

  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];

  for (const para of paragraphs) {
    if (para.length <= MAX_MRKTW) {
      chunks.push(para);
      continue;
    }
    let start = 0;
    while (start < para.length) {
      let end = Math.min(start + MAX_MRKTW, para.length);
      if (end < para.length) {
        const cut = para.lastIndexOf('\n', end);
        if (cut > start + 400) end = cut;
      }
      const slice = para.slice(start, end).trim();
      if (slice) chunks.push(slice);
      start = end;
    }
  }

  if (chunks.length > MAX_BLOCKS) {
    const kept = chunks.slice(0, MAX_BLOCKS - 1);
    kept.push('_(이하 생략 — 전체는 메시지 미리보기·접근성용 `text` 필드와 동일 본문)_');
    return kept;
  }

  return chunks;
}
