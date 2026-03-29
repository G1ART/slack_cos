/**
 * Slack 사용자 입력 → handleUserText 라우팅용 **단일** 정규화 파이프라인.
 * getInboundCommandText / app.js 에서 동일 순서로만 호출해 진입 문자열이 갈라지지 않게 한다.
 */

import { collapsePlannerRegisterSpacing } from '../features/plannerRoute.js';

/**
 * rich_text 굵게 등으로 `*계획상세*` 형태가 되면 라우터 startsWith 가 실패함 → 첫 줄만 장식 제거.
 */
export function normalizeSlackCommandDecorations(input) {
  if (input == null || input === '') return '';
  const s = String(input).replace(/[\u200B-\u200D\uFEFF]/g, '');
  const nl = s.indexOf('\n');
  const stripLine = (line) =>
    line
      .replace(/\*+/g, '')
      .replace(/`/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  if (nl === -1) return stripLine(s);
  return `${stripLine(s.slice(0, nl))}\n${s.slice(nl + 1)}`.trim();
}

/**
 * `계획 상세`처럼 중간 공백이 들어가도 `계획상세` 명령으로 인식. 자연어 `계획 세워줘`는 건드리지 않음.
 */
export function normalizePlanMgmtCommandLine(input) {
  const t = String(input || '').trim();
  const suffixes = [
    '발행목록',
    '작업목록',
    '상세',
    '승인',
    '기각',
    '발행',
    '진행',
    '시작',
    '완료',
    '차단',
    '변경',
    '요약',
  ];
  for (const suf of suffixes) {
    const esc = suf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^계획\\s+${esc}(\\s|$|:|[：﹕∶])`);
    if (re.test(t)) return t.replace(/^계획\s+/, '계획');
  }
  return t;
}

/**
 * Bolt 이벤트에서 뽑은 raw 문자열(멘션 제거·blocks 병합 후)에 대해 라우터가 쓰는 최종 문자열.
 * 순서 고정: trim → collapsePlannerRegisterSpacing → planMgmt 줄 → Slack 장식 제거
 */
export function normalizeSlackUserPayload(raw) {
  let t = String(raw ?? '').trim().normalize('NFC');
  t = collapsePlannerRegisterSpacing(t);
  t = normalizePlanMgmtCommandLine(t);
  t = normalizeSlackCommandDecorations(t);
  return t;
}
