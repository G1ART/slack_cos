#!/usr/bin/env node
/**
 * Henry 2턴: 본문이 Council 명령이 아니면 `start_project_confirmed`(Council 합성 아님).
 * (프로덕션에서 `협의모드 ` 접두 오탐·잠금 차단 회귀 방지)
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-henry-t2-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const { clearConversationBuffer, recordConversationTurn, buildSlackThreadKey } = await import(
  '../src/features/slackConversationBuffer.js'
);
const { openProjectIntakeSession, clearProjectIntakeSessionsForTest } = await import(
  '../src/features/projectIntakeSession.js'
);
const { tryStartProjectLockConfirmedResponse } = await import('../src/features/startProjectLockConfirmed.js');
const { isCouncilCommand } = await import('../src/slack/councilCommandPrefixes.js');

const meta = { channel: 'CHENRY2', thread_ts: '1743000000.t2', source_type: 'channel_mention' };
const kickText =
  '더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';
const kickAssistant = [
  '*[정렬 · 툴/프로젝트 킥오프]*',
  '',
  '*1. 내가 이해한 요청*',
  kickText,
  '',
  '*6. 다음 산출물*',
  '좁힌 범위 기준 실행 계획',
].join('\n');

const turn2 = [
  'MVP 가정은 정확해.',
  '중심 사용은 개인/팀 일정 관리가 우선이야.',
  '반복 일정도 필요해.',
  '승인이 필요한 일정은 (1) 타임블럭 충돌 (2) 대표 일정 (3) 외부 일정.',
  '진행해줘.',
].join('\n');

clearConversationBuffer();
clearProjectIntakeSessionsForTest();
openProjectIntakeSession(meta, { goalLine: kickText });
const key = buildSlackThreadKey(meta);
recordConversationTurn(key, 'user', kickText);
recordConversationTurn(key, 'assistant', kickAssistant);

assert.equal(isCouncilCommand(turn2), false, 'Henry follow-up must not be classified as explicit Council');
const out = await tryStartProjectLockConfirmedResponse(turn2, meta);
assert.ok(out, 'expected lock confirmed');
assert.equal(out.response_type, 'start_project_confirmed');
assert.ok(out.text.includes('범위 잠금'), 'lock title');
for (const b of ['페르소나별 핵심 관점', '종합 추천안', '협의 모드: council']) {
  assert.ok(!out.text.includes(b), `must not be council synthesis: ${b}`);
}

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
clearProjectIntakeSessionsForTest();
clearConversationBuffer();
console.log('ok: henry turn2 scope lock (not council)');
