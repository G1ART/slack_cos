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

const required = ['이해한 바', '기본 가정', '확인 질문', '월+주', '실행 큐', 'APR)을 만들지'];
for (const r of required) {
  assert.ok(out.text.includes(r), `missing contract fragment: ${r}`);
}

await fs.rm(tmp, { recursive: true, force: true });
console.log('ok: start_project kickoff contract');
