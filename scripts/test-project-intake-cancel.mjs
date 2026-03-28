#!/usr/bin/env node
/** 인테이크 명시 취소 + 활성 인테이크 중 Council(협의모드) 명령이 사전 라우터에서 대표 표면으로 전환되는지 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-intake-cancel-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const {
  openProjectIntakeSession,
  clearProjectIntakeSessionsForTest,
  isActiveProjectIntake,
  tryFinalizeProjectIntakeCancel,
} = await import('../src/features/projectIntakeSession.js');
const { runInboundCommandRouter } = await import('../src/features/runInboundCommandRouter.js');
const { buildRouterSyncSnapshot } = await import('../src/testing/routerSyncSnapshot.js');
const { classifyInboundResponderPreview } = await import('../src/features/runInboundAiRouter.js');

const meta = { channel: 'CINTAKE', thread_ts: '1744000000.cancel', source_type: 'channel_mention' };
const goalLine = '테스트 툴 범위';

clearProjectIntakeSessionsForTest();
openProjectIntakeSession(meta, { goalLine });
assert.equal(isActiveProjectIntake(meta), true);

const cancelOut = tryFinalizeProjectIntakeCancel('인테이크 취소', meta);
assert.ok(cancelOut?.text.includes('인테이크 취소'), cancelOut?.text);
assert.equal(cancelOut.response_type, 'project_intake_cancel');
assert.equal(isActiveProjectIntake(meta), false);

openProjectIntakeSession(meta, { goalLine });
const noop = tryFinalizeProjectIntakeCancel('인테이크 취소', { ...meta, thread_ts: 'other' });
assert.equal(noop.response_type, 'project_intake_cancel_noop');

const help = () => 'help';
const routed = await runInboundCommandRouter({
  userText: '협의모드: 일정 충돌을 어떻게 볼까?',
  metadata: meta,
  getExecutiveHelpText: help,
  getOperatorHelpText: help,
  runPlannerHardLockedBranch: async () => 'skip',
  structuredDeps: {},
});
assert.equal(routed.done, true);
assert.ok(String(routed.response).includes('[인테이크 진행 중]'), routed.response);
assert.ok(String(routed.response).includes('인테이크 취소'), routed.response);

openProjectIntakeSession(meta, { goalLine });
const snap = buildRouterSyncSnapshot('협의모드 질문');
const prev = await classifyInboundResponderPreview(snap, meta);
assert.equal(prev.responder, 'executive_surface');
assert.equal(prev.surfaceResponseType, 'project_intake_council_deferred');
assert.ok(String(prev.surfaceRaw).includes('인테이크 취소'));

await fs.rm(tmp, { recursive: true, force: true });
clearProjectIntakeSessionsForTest();
console.log('ok: project intake cancel + council defer');
