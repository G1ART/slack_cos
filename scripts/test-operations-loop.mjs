#!/usr/bin/env node
/**
 * Operations Loop + Planner Front Door Hotfix v2 — lightweight checks.
 * Run: node scripts/test-operations-loop.mjs
 */
import {
  extractPlannerRequest,
  buildPlannerDedupKey,
  peekPlannerDedupPlanId,
  storePlannerDedupPlanId,
  normalizePlannerInputForRoute,
} from '../src/features/plannerRoute.js';
import { extractQueryCommandLine, matchQueryCommandPrefix } from '../src/features/queryOnlyRoute.js';
import { getInboundCommandText } from '../src/slack/inboundText.js';
import { normalizeSlackUserPayload } from '../src/slack/slackTextNormalize.js';
import { tryParseCosNavigatorTrigger } from '../src/features/cosNavigator.js';
import { WORKFLOW_PHASE_IDS } from '../src/features/cosWorkflowPhases.js';
import { inferCursorIngestResultStatus } from '../src/features/cursorHandoff.js';
import {
  aggregateWorkBuckets,
  normalizeWorkLifecycleStatus,
  formatWorkReviewSummaryFromParts,
  derivePlanRollupLabel,
} from '../src/features/workLifecycle.js';
import {
  extractLastPlanIdFromTranscript,
  pickThreadPlanFollowUpHint,
} from '../src/features/threadPlanFollowUpHint.js';

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

function ex(s) {
  return extractPlannerRequest(normalizePlannerInputForRoute(s));
}

// Planner routing (normalize → extract)
assert('colon', ex('계획등록: abc')?.route_reason === 'explicit_colon');
// 앱 표시명·멘션 잔여 등으로 줄 앞에 접두가 붙은 경우
assert(
  'planner_after_app_prefix',
  ex('G1_COS 계획등록: slack_cos 앱 접두 뒤 플래너')?.route_reason === 'explicit_colon' &&
    ex('G1_COS 계획등록: slack_cos 앱 접두 뒤 플래너')?.raw.includes('slack_cos')
);
assert('multiline_colon', ex('\n\n계획등록: abc')?.route_reason === 'explicit_colon');
const splitColonNl = ex('계획등록:\nSlack COS hosted 배포 및 Supabase 전환');
assert(
  'colon_newline_then_body',
  splitColonNl?.route_reason === 'explicit_colon' && splitColonNl?.raw.includes('Slack COS')
);
const splitColonNl2 = ex('*계획등록:*\n다음 줄 본문');
assert(
  'colon_bold_newline_body',
  splitColonNl2?.route_reason === 'explicit_colon' && splitColonNl2?.raw.includes('다음 줄')
);
assert('bold_wrap', ex('*계획등록: slack_cos 테스트*')?.route_reason === 'explicit_colon');
assert('bold_open_only', ex('*계획등록: slack_cos 테스트')?.route_reason === 'explicit_colon');
assert('star_line_then_planner', ex('*\n계획등록: abc')?.route_reason === 'explicit_colon');
assert('blockquote_planner', ex('> 계획등록: abc')?.route_reason === 'explicit_colon');
assert('noise_lines_then_planner', ex('  \n  *  \n  계획등록: abc')?.route_reason === 'explicit_colon');
assert('vs16_after_bold', ex('*계획등록: slack_cos*\uFE0F')?.route_reason === 'explicit_colon');
// U+2028 LINE SEPARATOR: 시각적 한 줄인데 JS (.*) 는 여기서 끊겨 Council 로 새던 케이스
const u2028 = ex('계획등록: 본문\u2028continues');
assert(
  'line_sep_u2028',
  u2028?.route_reason === 'explicit_colon' && u2028?.raw.includes('continues')
);
assert('fullwidth_colon_ff1a', ex('계획등록\uFF1A abc')?.route_reason === 'explicit_colon');
// rich_text 노드 분리 시 "계획 등록 :" → collapse 후 planner
assert('spaced_keyword_colon', ex('계획 등록: slack split body')?.route_reason === 'explicit_colon');
assert('spaced_keyword_colon_empty', ex('계획 등록: ')?.empty_body === true);

const mentionOnlyBoldBlocks = getInboundCommandText({
  text: '<@U09TEST1234> ',
  blocks: [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: '계획등록: slack_cos에서 업무상세 요약 줄 추가',
              style: { bold: true },
            },
          ],
        },
      ],
    },
  ],
});
assert(
  'inbound_mention_only_richtext_bold',
  ex(mentionOnlyBoldBlocks)?.route_reason === 'explicit_colon'
);
assert('space', ex('계획등록 foo bar')?.route_reason === 'explicit_keyword_space');
assert('nl_split', ex('단계별 계획으로 나눠줘')?.route_reason === 'nl_split_steps');
assert('no_planner', ex('안녕하세요') === null);

const emptyColon = ex('계획등록:');
assert('empty_colon_raw', emptyColon?.raw === '');
assert('empty_colon_flag', emptyColon?.empty_body === true);

// 조회 명령이 2번째 줄일 때: 전체 문자열 startsWith('계획상세') 는 실패 → 예전엔 Council 로 새었음
const multiQuery = normalizeSlackUserPayload('앞줄 안내\n계획상세 PLN-FAKE-ML-01');
assert('query_multiline_full_miss', matchQueryCommandPrefix(multiQuery) === null);
assert(
  'query_multiline_extract',
  extractQueryCommandLine(multiQuery)?.startsWith('계획상세') &&
    extractQueryCommandLine(multiQuery)?.includes('PLN-FAKE-ML-01')
);

// 앞에 맥락 문장·멘션 잔여 등으로 줄이 `계획상세` 로 시작하지 않을 때 (인라인 스캔)
const inlineCtx = normalizeSlackUserPayload('확인 부탁드려요 계획상세 PLN-FAKE-INLINE-99');
const exInline = extractQueryCommandLine(inlineCtx);
assert(
  'query_inline_after_context',
  exInline === '계획상세 PLN-FAKE-INLINE-99' || exInline?.startsWith('계획상세 PLN-FAKE-INLINE-99')
);

// rich_text 글자 단위 분리 + ID 붙여쓰기
const spaced = normalizeSlackUserPayload('계 획 상 세PLN-FAKE-SPACED-88');
const exSpaced = extractQueryCommandLine(spaced);
assert(
  'query_spaced_hangul_no_space_id',
  exSpaced === '계획상세 PLN-FAKE-SPACED-88' || exSpaced === '계획상세PLN-FAKE-SPACED-88'
);

// @봇 표시명 "G1 COS" + rich_text 가 LATIN↔한글 경계에서 공백 없이 붙는 경우
const glued = normalizeSlackUserPayload('G1 COS계획진행PLN-GLUE-01');
const exGlue = extractQueryCommandLine(glued);
assert(
  'query_latin_glue_before_hangul_command',
  exGlue === '계획진행 PLN-GLUE-01' || exGlue === '계획진행PLN-GLUE-01'
);

// COS 내비게이터 트리거 (LLM 없이 파싱만)
const n1 = tryParseCosNavigatorTrigger('COS 캘린더 만들고 싶어');
assert('nav_cos_body', n1?.trigger === 'cos' && n1.body === '캘린더 만들고 싶어');
const n2 = tryParseCosNavigatorTrigger('COS\n둘째 줄');
assert('nav_cos_multiline', n2?.body === '둘째 줄');
const n3 = tryParseCosNavigatorTrigger('비서: 뭐부터 하지');
assert('nav_secretary', n3?.trigger === 'secretary' && n3.body === '뭐부터 하지');
assert('nav_no_cosmic', tryParseCosNavigatorTrigger('COSMIC 연대기') === null);

assert(
  'workflow_phases_north_star',
  WORKFLOW_PHASE_IDS.length === 4 && WORKFLOW_PHASE_IDS.includes('agree')
);

// Dedup key (normalized body)
const k = buildPlannerDedupKey({ channel: 'C1', user: 'U1', normalizedBody: 'same   body\n' });
assert('dedup_miss', peekPlannerDedupPlanId(k) === null);
storePlannerDedupPlanId(k, 'PLN-260320-01');
assert('dedup_hit', peekPlannerDedupPlanId(k) === 'PLN-260320-01');

// Buckets
const b = aggregateWorkBuckets(['draft', 'dispatched', 'review', 'needs_revision', 'done']);
assert('bucket_total', b.total === 5);
assert('bucket_rev', b.review_requested === 1);
const b2 = aggregateWorkBuckets(['approved', 'assigned', 'proposed']);
assert('bucket_split_approved_assigned', b2.approved === 1 && b2.assigned === 1 && b2.approval_pending === 1);

assert('norm_review', normalizeWorkLifecycleStatus('review') === 'review_requested');
assert('plan_rollup_all_done', derivePlanRollupLabel('approved', { total: 2, done: 2 }) === 'all_work_done');
assert('cursor_infer_impl_done', inferCursorIngestResultStatus('1차 구현 완료') === 'patch_complete');
assert('cursor_infer_unknown', inferCursorIngestResultStatus('상태 보고 드립니다') === 'unknown');

const txt = formatWorkReviewSummaryFromParts(
  { id: 'WRK-1', status: 'review_requested', source_plan_id: 'PLN-1', notes: 'a\nb' },
  { status: 'approved' },
  { run_id: 'RUN-1', status: 'review', result_summary: 'ok' },
  { run_id: 'RUN-1', status: 'review' }
);
assert('review_summary_has_id', txt.includes('WRK-1'));
assert('review_summary_pending', txt.includes('검토 대기(review_requested): yes'));

assert(
  'thread_hint_extract_last',
  extractLastPlanIdFromTranscript('x PLN-260323-01 y PLN-260323-04') === 'PLN-260323-04'
);
assert(
  'thread_hint_pick',
  pickThreadPlanFollowUpHint({
    priorTranscript: '[COS]\n등록 완료 PLN-260323-04',
    currentUserText: '더그린 아뜰리에 캘린더 범위만 더 좁혀줘',
  }) === 'PLN-260323-04'
);
assert(
  'thread_hint_skip_when_query',
  pickThreadPlanFollowUpHint({
    priorTranscript: '[COS]\nPLN-260323-04',
    currentUserText: '계획상세 PLN-260323-04',
  }) === null
);
assert(
  'thread_hint_skip_when_has_id',
  pickThreadPlanFollowUpHint({
    priorTranscript: '[COS]\nPLN-260323-04',
    currentUserText: 'PLN-260323-04 상태 알려줘',
  }) === null
);

console.log('\nAll script checks passed.');
