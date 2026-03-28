#!/usr/bin/env node
/**
 * 킥오프 2턴 — 답변 + 진행해줘 → start_project_confirmed 표면, Council·업무등록 유도 금지.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-lock-confirmed-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const {
  clearConversationBuffer,
  recordConversationTurn,
  buildSlackThreadKey,
} = await import('../src/features/slackConversationBuffer.js');
const { tryStartProjectLockConfirmedResponse, buildProjectLockConfirmedSurface } = await import(
  '../src/features/startProjectLockConfirmed.js'
);

const kickUser =
  '툴제작: 더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';
const kickCos = [
  '*[정렬 · 툴/프로젝트 킥오프]*',
  '',
  '*1. 내가 이해한 요청*',
  '_stub_',
  '*6. 다음 산출물*',
  'stub',
].join('\n');

const turn2 =
  'MVP 가정은 정확해. 중심 사용은 개인/팀 일정 관리가 우선이야. 반복 일정도 필요해. 승인이 필요한 일정은 전시·대관·외부 대관만 관리자 승인이야. 진행해줘.';

const meta = { channel: 'ClockCF', thread_ts: '999888.77', source_type: 'channel_mention' };
const key = buildSlackThreadKey(meta);

clearConversationBuffer();
recordConversationTurn(key, 'user', kickUser);
recordConversationTurn(key, 'assistant', kickCos);

const out = await tryStartProjectLockConfirmedResponse(turn2, meta);
assert.ok(out, 'expected lock confirmed surface');
assert.equal(out.response_type, 'start_project_confirmed');

const banned = [
  '페르소나별 핵심 관점',
  '종합 추천안',
  '실행 작업 후보로 보입니다',
  '업무등록:',
  '승인 대기열\n- 상태: pending',
  '내부 처리 정보',
];
for (const b of banned) {
  assert.ok(!out.text.includes(b), `forbidden council/operator leak: ${b}`);
}

assert.ok(out.text.includes('범위 잠금'), 'title');
assert.ok(out.text.includes('PLN'), 'artifact plan');
assert.ok(out.text.includes('실행 정렬 큐') || out.text.includes('큐'), 'queue note');

const pure = buildProjectLockConfirmedSurface('goal line', '답변만');
assert.ok(pure.includes('잠긴 MVP'));

await fs.rm(tmp, { recursive: true, force: true });
console.log('ok: start_project lock confirmed');
