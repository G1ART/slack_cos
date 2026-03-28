/**
 * Council 명시 진입 — **`isCouncilCommand`** 는 `parseCouncilCommand` 와 정렬(접두만으론 부족).
 * @see COUNCIL_COMMAND_PREFIXES — 문서·테스트 레퍼런스용 (블록 Kit 등에서 흔한 `협의모드 ` 오탐 방지).
 */

import { parseCouncilCommand } from '../agents/council.js';
import { isStartProjectKickoffInput } from '../features/surfaceIntentClassifier.js';

/** 문서·grep용 — 판정은 `isCouncilCommand`(파싱+킥오프 제외)만 신뢰 */
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

/**
 * 명시 Council만 — `협의모드 MVP…` 처럼 접두만 비슷하고 파싱 불가면 **false** (잠금·킥오프 차단 방지).
 * `협의모드 툴제작:` 은 킥오프로 처리.
 * @param {string} text
 */
export function isCouncilCommand(text) {
  const t = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!t) return false;
  if (isStartProjectKickoffInput(t)) return false;
  return parseCouncilCommand(t) != null;
}
