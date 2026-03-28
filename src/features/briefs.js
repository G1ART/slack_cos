import { getStoreCore } from '../storage/core/index.js';
import { getPendingApprovals } from './approvals.js';

let callTextFn = null;

function tail(items, maxCount) {
  return items.slice(-maxCount);
}

async function getRecordsWithinDays(collectionName, days) {
  const store = getStoreCore();
  const items = await store.list(collectionName);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const t = Date.parse(item?.created_at || '');
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function initBriefs({ callText }) {
  callTextFn = callText;
}

function assertCallText() {
  if (!callTextFn) {
    throw new Error('briefs.js: callText not injected (initBriefs not called)');
  }
}

export async function buildDecisionHighlights(days) {
  assertCallText();
  const decisions = tail(await getRecordsWithinDays('decisions', days), 20);

  if (!decisions.length) {
    return `최근 ${days}일 기준 저장된 의사결정 기록이 없습니다.`;
  }

  const instructions = `
당신은 G1.ART 비서실장이다.
아래 의사결정 기록을 바탕으로 대표가 빠르게 파악할 수 있는 핵심 결정 요약을 작성하라.

규칙:
- 한국어로 작성
- 최근 ${days}일 기준
- 3~7개 핵심만 추려라
- 결정 자체보다 왜 중요한지, 다음에 무엇을 봐야 하는지까지 짧게 써라
- 장황하게 쓰지 말고 대표 보고용으로 압축하라

출력 형식:
이번주 핵심결정
- ...
- ...
`;

  return callTextFn({
    instructions,
    input: JSON.stringify({ days, decisions }, null, 2),
  });
}

export async function buildLessonHighlights(days) {
  assertCallText();
  const lessons = tail(await getRecordsWithinDays('lessons', days), 20);

  if (!lessons.length) {
    return `최근 ${days}일 기준 저장된 교훈 기록이 없습니다.`;
  }

  const instructions = `
당신은 G1.ART 비서실장이다.
아래 교훈 기록을 바탕으로 대표가 바로 참고할 수 있는 핵심 교훈 요약을 작성하라.

규칙:
- 한국어로 작성
- 최근 ${days}일 기준
- 반복되는 패턴을 우선해 뽑아라
- 다음 실행에 바로 반영할 수 있는 문장으로 써라
- 장황하게 쓰지 말고 대표 보고용으로 압축하라

출력 형식:
이번주 핵심교훈
- ...
- ...
`;

  return callTextFn({
    instructions,
    input: JSON.stringify({ days, lessons }, null, 2),
  });
}

export async function buildRiskHighlights(days) {
  assertCallText();
  const interactions = tail(await getRecordsWithinDays('interactions', days), 30);
  const decisions = tail(await getRecordsWithinDays('decisions', days), 20);
  const approvals = await getPendingApprovals(20);

  if (!interactions.length && !decisions.length && !approvals.length) {
    return `최근 ${days}일 기준 리스크 분석에 사용할 기록이 없습니다.`;
  }

  const instructions = `
당신은 G1.ART의 비서실장 겸 리스크 정리자다.
아래 상호작용 로그, 의사결정 기록, 승인 대기 안건을 바탕으로 대표가 당장 봐야 할 핵심 리스크를 요약하라.

규칙:
- 한국어로 작성
- 최근 ${days}일 기준
- 막연한 위험이 아니라 실제로 놓치기 쉬운 리스크를 우선 정리하라
- 재검토 트리거가 있으면 함께 써라
- 3~7개 정도로 압축하라

출력 형식:
이번주 핵심리스크
- 리스크 / 왜 중요한지 / 무엇을 보면 재검토할지
`;

  return callTextFn({
    instructions,
    input: JSON.stringify({ days, decisions, interactions, approvals }, null, 2),
  });
}

export async function buildWeeklyBrief(days) {
  assertCallText();
  const decisions = tail(await getRecordsWithinDays('decisions', days), 20);
  const lessons = tail(await getRecordsWithinDays('lessons', days), 20);
  const interactions = tail(await getRecordsWithinDays('interactions', days), 30);
  const approvals = await getPendingApprovals(20);

  if (!decisions.length && !lessons.length && !interactions.length && !approvals.length) {
    return `최근 ${days}일 기준 브리프를 만들 기록이 없습니다.`;
  }

  const instructions = `
당신은 G1.ART 비서실장이다.
아래 최근 ${days}일 데이터를 바탕으로 대표용 주간 브리프를 작성하라.

규칙:
- 한국어
- 짧고 단단하게
- 대표가 바로 읽고 결정을 이어갈 수 있는 수준으로
- 필요 이상 장황하지 않게
- 가장 중요한 것만 추려라
- 승인 대기 안건이 있으면 반드시 반영하라

출력 형식:
주간 브리프 (최근 ${days}일)

1. 전체 상황 한 줄 요약
2. 핵심 결정
3. 핵심 교훈
4. 가장 중요한 리스크
5. 승인 대기 안건
6. 다음 주 최우선 행동
7. 대표 결정 필요 항목
`;

  return callTextFn({
    instructions,
    input: JSON.stringify({ days, decisions, lessons, interactions, approvals }, null, 2),
  });
}

export async function buildExecutiveReport(days) {
  assertCallText();
  const decisions = tail(await getRecordsWithinDays('decisions', days), 20);
  const lessons = tail(await getRecordsWithinDays('lessons', days), 20);
  const interactions = tail(await getRecordsWithinDays('interactions', days), 30);
  const approvals = await getPendingApprovals(20);

  if (!decisions.length && !lessons.length && !interactions.length && !approvals.length) {
    return `최근 ${days}일 기준 대표보고서를 만들 기록이 없습니다.`;
  }

  const instructions = `
당신은 G1.ART 비서실장이다.
아래 최근 ${days}일 데이터를 바탕으로 대표보고서를 작성하라.

규칙:
- 한국어
- 경영자용 보고서 톤
- 결론 먼저
- 우선순위, 리스크, 결정을 명확히
- 실행 제안과 대표 판단 포인트를 분리해서 제시
- 승인 대기 안건을 반드시 반영하라
- 장황하지 않게

출력 형식:
대표보고서 (최근 ${days}일)

1. 결론
2. 지금 가장 중요한 3가지
3. 놓치면 안 되는 리스크
4. 승인 대기 안건
5. 바로 실행할 것
6. 대표 판단 필요 사항
`;

  return callTextFn({
    instructions,
    input: JSON.stringify({ days, decisions, lessons, interactions, approvals }, null, 2),
  });
}
