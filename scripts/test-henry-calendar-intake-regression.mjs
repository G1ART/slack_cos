#!/usr/bin/env node
/**
 * Henry 시나리오: 전사 없이(버퍼 비어 있음) sticky 인테이크만으로 2턴째가 Council 비슷한 합성으로 새지 않고 잠금 또는 정제로 고정되는지.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-henry-intake-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const { clearConversationBuffer, buildSlackThreadKey } = await import(
  '../src/features/slackConversationBuffer.js'
);
const { openProjectIntakeSession, clearProjectIntakeSessionsForTest } = await import(
  '../src/features/projectIntakeSession.js'
);
const { tryStartProjectLockConfirmedResponse } = await import('../src/features/startProjectLockConfirmed.js');

const meta = { channel: 'CHENRY', thread_ts: '1743000000.henry', source_type: 'channel_mention' };
const goalLine = '더그린 갤러리 & 아뜰리에 멤버 스케줄 캘린더';

clearConversationBuffer();
clearProjectIntakeSessionsForTest();
openProjectIntakeSession(meta, { goalLine });

const turn2 = [
  'MVP 가정은 정확해.',
  '내부에서 툴이 안정되면 다음 단계는 링크를 받은 외부 사용자도 블랙아웃만 볼 수 있게 할 계획이야.',
  '중심 사용은 개인/팀 일정 관리가 우선이야.',
  '반복 일정도 필요해.',
  '승인이 필요한 일정은 (1) 기존 타임블럭 충돌 (2) 대표 일정 (3) 외부 일정.',
  '진행해줘.',
].join('\n');

const out = await tryStartProjectLockConfirmedResponse(turn2, meta);
assert.ok(out, 'expected lock with only intake session + empty transcript');
assert.equal(out.response_type, 'start_project_confirmed');

const banned = ['페르소나별 핵심 관점', '종합 추천안', '내부 처리 정보\n- 협의 모드', '실행 작업 후보로 보입니다'];
for (const b of banned) {
  assert.ok(!out.text.includes(b), `council leak: ${b}`);
}
assert.ok(out.text.includes('범위 잠금'), 'lock title');

await fs.rm(tmp, { recursive: true, force: true });
clearProjectIntakeSessionsForTest();
console.log('ok: henry calendar intake regression (sticky session, empty transcript)');
