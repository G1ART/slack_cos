import { strict as assert } from 'node:assert';
import { founderRequestPipeline } from '../../src/core/founderRequestPipeline.js';
import { clearProjectIntakeSessionsForTest } from '../../src/features/projectIntakeSession.js';
import { clearExecutionRunsForTest } from '../../src/features/executionRun.js';

const MARKERS = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '내부 처리 정보',
  '참여 페르소나',
  '협의 모드',
  'institutional memory',
];

function noCouncil(text) {
  for (const marker of MARKERS) {
    assert.equal(String(text).includes(marker), false, `forbidden marker detected: ${marker}`);
  }
}

function mustIncludeAll(text, list, label) {
  for (const item of list) {
    assert.equal(String(text).includes(item), true, `${label}: missing "${item}"`);
  }
}

const meta = {
  source_type: 'direct_message',
  channel: 'C_TEST_GOLD',
  thread_ts: '1700000000.200001',
  user: 'U_FOUNDER',
};

clearProjectIntakeSessionsForTest();
clearExecutionRunsForTest();

// Test 1 — New project kickoff
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(r.text, ['단순 기능 요청이 아니라', '벤치마크 축', 'MVP 범위', '지금 합의할 질문', '다음 단계'], 'kickoff');
}

// Test 2 — Follow-up narrowing
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '갤러리와 미술학원을 겸하는 공간의 내부 멤버, 나아가 링크를 받은 외부 손님들까지 공동으로 관리할 수 있는 캘린더야. 벤치마킹을 통해 필수 기능, 부가 기능, 구현 아키텍처를 마련해줘.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(r.text, ['벤치마크 축', 'MVP 범위', '제외 범위', '핵심 리스크/검증 포인트'], 'followup');
}

// Test 3 — Pushback / realism
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '외부 손님도 수정 권한까지 주고 싶고, 동시에 운영 리스크는 거의 없어야 해.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(r.text, ['핵심 리스크/검증 포인트', '지금 합의할 질문'], 'pushback');
}

// Test 4 — Scope lock request
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '좋아. 그럼 이 방향으로 MVP 범위를 잠그자.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(
    r.text,
    ['[Scope Lock Packet]', '문제 정의', '타겟 사용자', 'MVP 범위', '제외 범위', '성공 지표', '리스크', '초기 아키텍처 방향'],
    'scope_lock'
  );
}

// Test 5 — Meta debug
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: 'responder surface sanitize 한 줄로만 말해.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  assert.equal(r.text.includes('\n'), false, 'meta debug must be one-line');
}

// Test 6 — Status
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '지금 어디까지 됐어?',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(r.text, ['[진행 보고]', '현재 단계', '완료된 것', '진행 중', 'blocker', '외부 툴 truth', '다음 예정 작업'], 'status');
}

// Test 7 — Approval
{
  clearProjectIntakeSessionsForTest();
  const r = await founderRequestPipeline({
    text: '이 방향으로 실행 넘겨.',
    metadata: meta,
    route_label: 'dm_founder',
  });
  assert.ok(r?.text);
  noCouncil(r.text);
  mustIncludeAll(r.text, ['[Execution Handoff]', '프로젝트', 'run', 'dispatched workstreams', 'provider truth', '다음 founder action'], 'approval');
}

console.log('test-founder-gold-spec-v1: ok');
