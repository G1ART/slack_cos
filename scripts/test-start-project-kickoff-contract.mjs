#!/usr/bin/env node
/**
 * 툴제작 킥오프 계약 — North Star: domain(Council/APR) 이전에 start_project 표면 고정.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MSG =
  '툴제작: 더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-kickoff-contract-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.COS_FAST_SPEC_PROMOTE = '0';
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const { classifySurfaceIntent, isStartProjectKickoffInput } = await import(
  '../src/features/surfaceIntentClassifier.js'
);
const { tryExecutiveSurfaceResponse } = await import('../src/features/tryExecutiveSurfaceResponse.js');

assert.equal(classifySurfaceIntent(MSG)?.intent, 'start_project');
assert.equal(isStartProjectKickoffInput(MSG), true);

const meta = { channel: 'CFIX', user: 'UFIX' };
const out = await tryExecutiveSurfaceResponse(MSG, meta);
assert.equal(out.response_type, 'start_project');

const banned = [
  '페르소나별 핵심 관점',
  '종합 추천안',
  '승인 대기열\n- 상태: pending',
  '내부 처리 정보',
  '가장 강한 반대 논리',
  '질문 리스트에 답',
];
for (const b of banned) {
  assert.ok(!out.text.includes(b), `must not leak council/approval shape: ${b}`);
}

const required = [
  '내가 이해한 요청',
  '기본 MVP 가정안',
  '포함 / 제외',
  '핵심 질문',
  '무응답 시 적용할 기본값',
  '다음 산출물',
  '월+주',
  '실행 정렬 큐',
  'APR)을 만들지 않습니다',
];
for (const r of required) {
  assert.ok(out.text.includes(r), `missing contract fragment: ${r}`);
}

const { clearConversationBuffer, recordConversationTurn, buildSlackThreadKey } = await import(
  '../src/features/slackConversationBuffer.js'
);
const { resolveCleanStartProjectKickoff } = await import('../src/features/startProjectKickoffDoor.js');

clearConversationBuffer();
const pushMeta = { channel: 'CFIX-PUSH', thread_ts: '1111.2222' };
const priorMsg =
  '툴제작: 더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';
const kPush = buildSlackThreadKey(pushMeta);
recordConversationTurn(kPush, 'user', priorMsg);
const pushText = '그니까 네가 먼저 기준안을 보여주고 필요한 질문만 해';
const door = resolveCleanStartProjectKickoff(pushText, pushMeta);
assert.ok(door?.line && door.line.includes('툴제작:'), 'pushback must recover kickoff line');
const outPush = await tryExecutiveSurfaceResponse(door.line, pushMeta, {
  startProjectToneAck: door.toneAck,
});
assert.equal(outPush.response_type, 'start_project');
assert.ok(outPush.text.includes('기준안을 먼저'), 'tone ack visible');
assert.ok(!outPush.text.includes('페르소나별 핵심 관점'));

await fs.rm(tmp, { recursive: true, force: true });
console.log('ok: start_project kickoff contract');
