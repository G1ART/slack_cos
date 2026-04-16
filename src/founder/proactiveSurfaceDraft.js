/**
 * W10-A — Proactive Surface Draft (audit/draft only).
 *
 * Policy 가 고른 signals 를 founder 대화 입력 맨 위에 삽입될 **한국어 자연어 메모 블록**으로 변환한다.
 * 본 draft 는 새 Slack 송신 경로가 아니다 — 그저 기존 `buildFounderConversationInput` 이 조립하는
 * 블록의 한 섹션("[COS 운영 메모]") 으로 병치된다. 최종 송신은 `sendFounderResponse` 단일 spine.
 *
 * 순수 함수: 외부 호출 없음.
 */

/**
 * @param {{
 *   compact_lines: string[],
 *   max_lines?: number,
 *   header?: string,
 * }} input
 * @returns {{ block_lines: string[], header: string, empty: boolean }}
 */
export function buildProactiveSurfaceDraft(input = {}) {
  const raw = Array.isArray(input.compact_lines) ? input.compact_lines : [];
  const max = Number.isFinite(input.max_lines) && input.max_lines > 0 ? Math.trunc(input.max_lines) : 5;
  const header = typeof input.header === 'string' && input.header.trim()
    ? input.header.trim()
    : '[COS 운영 메모 — 자동 요약, 없는 사실을 덧붙이지 마세요]';

  /** @type {string[]} */
  const cleaned = [];
  for (const line of raw) {
    const s = typeof line === 'string' ? line.trim() : '';
    if (!s) continue;
    cleaned.push(s.length > 300 ? `${s.slice(0, 299)}…` : s);
    if (cleaned.length >= max) break;
  }

  if (cleaned.length === 0) {
    return { block_lines: [], header, empty: true };
  }

  return {
    block_lines: [header, ...cleaned.map((l) => `- ${l}`)],
    header,
    empty: false,
  };
}
