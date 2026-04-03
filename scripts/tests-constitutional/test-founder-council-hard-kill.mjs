import assert from 'node:assert/strict';
import { runFounderDirectKernel } from '../../src/founder/founderDirectKernel.js';
import { finalizeSlackResponse } from '../../src/features/topLevelRouter.js';

const COUNCIL_MARKERS = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '남아 있는 긴장',
  '내부 처리 정보',
];

function assertNoCouncilMarkers(text, label) {
  const t = String(text || '');
  for (const marker of COUNCIL_MARKERS) {
    assert.equal(
      t.includes(marker),
      false,
      `${label}: council marker leaked (${marker})`
    );
  }
}

async function testFounderKickoffExactSentence() {
  const result = await runFounderDirectKernel({
    text: '오늘부터 테스트용 작은 프로젝트 하나 시작하자',
    metadata: {
      source_type: 'direct_message',
      channel: 'C_TEST',
      thread_ts: '1700000000.000101',
      user: 'U_TEST',
    },
    route_label: 'dm_founder',
  });
  assert.ok(result?.text, 'kickoff pipeline should return text');
  assertNoCouncilMarkers(result.text, 'kickoff');
}

async function testFounderMetaExactSentence() {
  const result = await runFounderDirectKernel({
    text: '버전',
    metadata: {
      source_type: 'direct_message',
      channel: 'C_TEST',
      thread_ts: '1700000000.000102',
      user: 'U_TEST',
    },
    route_label: 'dm_founder',
  });
  assert.ok(result?.text, 'meta pipeline should return text');
  assertNoCouncilMarkers(result.text, 'meta');
}

async function testFounderFollowUpExactSentence() {
  const result = await runFounderDirectKernel({
    text: 'responder surface sanitize 한 줄로만 말해.',
    metadata: {
      source_type: 'direct_message',
      channel: 'C_TEST',
      thread_ts: '1700000000.000103',
      user: 'U_TEST',
      has_active_intake: true,
      intake_session: { stage: 'active' },
    },
    route_label: 'dm_founder',
  });
  assert.ok(result?.text, 'follow-up pipeline should return text');
  assertNoCouncilMarkers(result.text, 'follow-up');
}

function testResponderCouncilHardFailOnFounderRoute() {
  const out = finalizeSlackResponse({
    responder: 'council',
    text: '테스트',
    raw_text: '협의모드: 테스트',
    normalized_text: '협의모드: 테스트',
    command_name: 'council_explicit',
    founder_route: true,
  });
  assert.match(out, /founder 경로에서는 council이 비활성화/, 'founder route council must hard-fail');
}

await testFounderKickoffExactSentence();
await testFounderMetaExactSentence();
await testFounderFollowUpExactSentence();
testResponderCouncilHardFailOnFounderRoute();

console.log('test-founder-council-hard-kill: ok');
