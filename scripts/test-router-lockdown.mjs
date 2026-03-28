#!/usr/bin/env node
/**
 * Top-Level Router Lockdown — acceptance-style checks (no live OpenAI for TEST A body).
 * Run: node scripts/test-router-lockdown.mjs
 */
import {
  analyzePlannerResponderLock,
  extractPlannerRequest,
  normalizePlannerInputForRoute,
  PLANNER_SLACK_EMPTY_BODY_MESSAGE,
} from '../src/features/plannerRoute.js';
import { handleQueryOnlyCommands, matchQueryCommandPrefix } from '../src/features/queryOnlyRoute.js';
import {
  finalizeSlackResponse,
  looksLikeCouncilSynthesisBody,
} from '../src/features/topLevelRouter.js';
import { getInboundCommandText } from '../src/slack/inboundText.js';

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

function councilFree(text) {
  return !looksLikeCouncilSynthesisBody(String(text || ''));
}

const routerCtx = { raw_text: '', normalized_text: '' };

// TEST A — planner prefix extracts (contract body requires storage; here: extract + no council in error path)
const testA =
  '계획등록: Slack COS를 hosted 환경으로 배포하고 production에서 Supabase read preference를 supabase로 전환하는 작업 계획을 세워줘.';
const normA = normalizePlannerInputForRoute(testA);
const lockA = analyzePlannerResponderLock(normA);
assert('TEST_A_planner_lock_hit', lockA.type === 'hit' && lockA.req?.route_reason === 'explicit_colon');
const finA = finalizeSlackResponse({
  responder: 'planner',
  text: 'Plan: PLN-test\nStatus: draft',
  raw_text: testA,
  normalized_text: normA,
  planner_match: true,
  council_blocked: true,
  response_type: 'planner_contract_mock',
});
assert('TEST_A_no_council_signature', councilFree(finA));

// TEST B — empty body
const testB = '계획등록:';
const normB = normalizePlannerInputForRoute(testB);
const lockB = analyzePlannerResponderLock(normB);
assert('TEST_B_hit_empty', lockB.type === 'hit' && lockB.req?.empty_body === true);
const emptyMsg = PLANNER_SLACK_EMPTY_BODY_MESSAGE;
assert('TEST_B_council_free', councilFree(emptyMsg));

// TEST C–F, G, H — query path
async function runQuery(label, input, checks) {
  const q = await handleQueryOnlyCommands(input);
  assert(`${label}_returned`, q != null && typeof q === 'string');
  assert(`${label}_council_free`, councilFree(q));
  if (checks) checks(q);
}

await runQuery('TEST_C', '계획상세 PLN-FAKE-NOT-REAL-999', (q) => {
  assert('TEST_C_not_found', q.includes('찾지 못했습니다'));
});
await runQuery('TEST_D', '계획진행 PLN-FAKE-NOT-REAL-999', (q) => {
  assert('TEST_D_not_found', q.includes('찾지 못했습니다'));
});
await runQuery('TEST_E', '업무상세 WRK-FAKE-NOT-REAL-999', (q) => {
  assert('TEST_E_not_found', q.includes('찾지 못했습니다'));
});
await runQuery('TEST_F', '업무검토 WRK-FAKE-NOT-REAL-999', (q) => {
  assert('TEST_F_not_found', q.includes('찾지 못했습니다'));
});

await runQuery('TEST_G', '업무상세 WRK-DOES-NOT-EXIST', (q) => {
  assert('TEST_G_shape', q.includes('[업무상세]') && q.includes('찾지 못했습니다'));
});

await runQuery('TEST_H', '계획진행', (q) => {
  assert('TEST_H_usage', q.includes('형식:') || q.includes('[계획진행]'));
});

// Query prefix matcher
assert('match_query_prefix', matchQueryCommandPrefix('계획발행목록 X') === '계획발행목록');

// Council leak sanitizer
const poison = '한 줄 요약\nfoo\n\n종합 추천안\nbar\n\n페르소나별 핵심 관점\n- x';
assert('poison_detected', looksLikeCouncilSynthesisBody(poison));
// 조회 응답은 저장 필드·포맷에 Council류 문구가 섞여도 덮어쓰지 않음 (오탐 방지)
const queryTrusted = finalizeSlackResponse({
  responder: 'query',
  text: poison,
  raw_text: '',
  normalized_text: '',
  query_match: true,
  council_blocked: true,
  response_type: 'test_poison',
});
assert('query_poison_trusted', queryTrusted === poison);
// 비조회 응답은 기존처럼 Council 혼입 차단
const dialogSanitized = finalizeSlackResponse({
  responder: 'dialog',
  text: poison,
  raw_text: '',
  normalized_text: '',
  query_match: false,
  council_blocked: true,
  response_type: 'test_poison_dialog',
});
assert('dialog_sanitized_short', dialogSanitized.includes('[COS]') && !dialogSanitized.includes('페르소나별'));

// extractPlannerRequest still works for NL
const nl = normalizePlannerInputForRoute('단계별 계획으로 나눠줘');
assert('nl_extract', extractPlannerRequest(nl)?.route_reason === 'nl_split_steps');
assert('nl_lock', analyzePlannerResponderLock(nl).type === 'hit');

// Slack rich_text: "계획" | " 등록: " 만 노드로 쪼개진 경우 → 단일 문자열로 복원 + planner lock
const splitRichTextEvent = {
  text: '<@U09TEST> ',
  blocks: [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            { type: 'text', text: '계획' },
            { type: 'text', text: ' 등록: ' },
          ],
        },
      ],
    },
  ],
};
const merged = getInboundCommandText(splitRichTextEvent);
const splitLock = analyzePlannerResponderLock(normalizePlannerInputForRoute(merged));
assert('inbound_richtext_split_planner', splitLock.type === 'hit' && splitLock.req?.empty_body === true);

// blocks 에만 조회 키워드가 있어 shouldPreferBlocks 가 text 를 밀어내도, text 쪽 `계획등록:` 이 더 강하면 채택
const plannerLostToBlocksEvent = {
  text: '<@U09TEST> 계획등록: 더그린 아뜰리에 캘린더 MVP',
  blocks: [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: '참고로 업무상세 WRK-REG-FX-99 는 별개이고, 본문은 직원·고객 일정 캘린더입니다.',
            },
          ],
        },
      ],
    },
  ],
};
const mergedPlanner = getInboundCommandText(plannerLostToBlocksEvent);
const plannerWinLock = analyzePlannerResponderLock(normalizePlannerInputForRoute(mergedPlanner));
assert(
  'inbound_planner_wins_over_blocks_marker',
  plannerWinLock.type === 'hit' && mergedPlanner.includes('계획등록')
);

console.log('\nAll router lockdown checks passed.');
