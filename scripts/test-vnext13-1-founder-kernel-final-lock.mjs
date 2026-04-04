#!/usr/bin/env node
/** vNext.13.1 — 커널 분리, default-deny 승인, COS_ONLY·승인 패킷 회귀 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const founderDir = path.join(__dirname, '..', 'src', 'founder');
const scanFiles = [
  'founderDirectKernel.js',
  'founderContextSynthesizer.js',
  'founderProposalPacket.js',
  'founderApprovalPacket.js',
  'founderProposalKernel.js',
  'executionModeFromProposalPacket.js',
];
const banned = ['classifyFounderIntent', 'resolveWorkObject', 'resolveWorkPhase'];
for (const f of scanFiles) {
  const src = fs.readFileSync(path.join(founderDir, f), 'utf8');
  for (const b of banned) {
    assert.ok(!src.includes(b), `${f} must not contain ${b}`);
  }
}

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fb = appSrc.indexOf('if (founderRoute) {');
const fe = appSrc.indexOf('// Operator / channel only');
assert.ok(fb !== -1 && fe > fb);
const founderSlice = appSrc.slice(fb, fe);
assert.ok(founderSlice.includes('runFounderDirectKernel({'));
assert.ok(!founderSlice.includes('founderRequestPipeline({'));

import { isExternalMutationAuthorized } from '../src/orchestration/approvalGate.js';

const baseRun = { external_execution_authorization: {} };
assert.equal(isExternalMutationAuthorized(null), false);
assert.equal(isExternalMutationAuthorized({ ...baseRun, external_execution_authorization: { state: undefined } }), false);
assert.equal(isExternalMutationAuthorized({ ...baseRun, external_execution_authorization: { state: null } }), false);
assert.equal(isExternalMutationAuthorized({ ...baseRun, external_execution_authorization: { state: 'pending_approval' } }), false);
assert.equal(isExternalMutationAuthorized({ ...baseRun, external_execution_authorization: { state: 'draft_only' } }), false);
assert.equal(isExternalMutationAuthorized({ ...baseRun, external_execution_authorization: { state: 'authorized' } }), true);

import {
  buildProposalFromFounderInput,
  buildProposalPacketFromSidecar,
} from '../src/founder/founderProposalKernel.js';
import { emptySidecarFromPartner } from '../src/founder/founderArtifactSchemas.js';
import { selectExecutionModeFromProposalPacket } from '../src/founder/executionModeFromProposalPacket.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { buildFounderApprovalPacket } from '../src/founder/founderApprovalPacket.js';

function ctx(ch) {
  const m = { source_type: 'direct_message', channel: ch, user: 'U', ts: '1' };
  return synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m });
}

const pIr = buildProposalFromFounderInput({ rawText: 'IR 덱 다시 써줘', contextFrame: ctx('Dir') });
assert.equal(selectExecutionModeFromProposalPacket(pIr), 'COS_ONLY');
assert.equal((pIr.external_execution_tasks || []).length, 0);

const pInv = buildProposalFromFounderInput({
  rawText: '투자자별 메시지 맞춰줘',
  contextFrame: ctx('Dinv'),
});
assert.equal(selectExecutionModeFromProposalPacket(pInv), 'COS_ONLY');
assert.equal((pInv.external_execution_tasks || []).length, 0);

const pBud = buildProposalFromFounderInput({
  rawText: '이번 분기 예산안 구조를 다시 짜줘',
  contextFrame: ctx('Dbud'),
});
assert.ok(['COS_ONLY', 'INTERNAL_SUPPORT'].includes(selectExecutionModeFromProposalPacket(pBud)));
assert.equal((pBud.external_execution_tasks || []).length, 0);

const pBench = buildProposalPacketFromSidecar(
  {
    ...emptySidecarFromPartner(''),
    conversation_status: 'exploring',
    proposal_artifact: {
      understood_request: '경쟁사 벤치마킹',
      internal_support_tasks: ['벤치마크 표'],
    },
  },
  ctx('Dbc'),
  '경쟁사 벤치마킹 정리해줘',
  { source: 'test' },
);
assert.equal(selectExecutionModeFromProposalPacket(pBench), 'INTERNAL_SUPPORT');
assert.equal((pBench.external_execution_tasks || []).length, 0);

const pExt = buildProposalPacketFromSidecar(
  {
    ...emptySidecarFromPartner(''),
    conversation_status: 'approval_pending',
    proposal_artifact: {},
    approval_artifact: {
      requires_external_dispatch: true,
      external_tasks: ['GitHub와 Supabase 실제 실행'],
      rationale: 'sidecar test',
    },
  },
  ctx('Dex'),
  '좋아, 이제 GitHub와 Supabase까지 실제로 실행해',
  { source: 'test' },
);
assert.ok(pExt.external_execution_tasks.length);
const ap = buildFounderApprovalPacket(pExt);
assert.ok(ap.visible_section.includes('롤백') || ap.visible_section.includes('중단점'));
assert.ok(ap.visible_section.includes('드래프트'));
assert.ok(ap.visible_section.includes('승인 옵션'));

const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g1cos-v131-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
await fs.promises.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');

const {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
  getExecutionRunById,
} = await import('../src/features/executionRun.js');
const { ensureExecutionRunDispatched } = await import('../src/features/executionDispatchLifecycle.js');
const { authorizeExternalExecutionForRun } = await import('../src/orchestration/approvalGate.js');

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V131:ext:1',
  goal_line: 'live',
  locked_scope_summary: 'x',
  includes: ['github PR'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({
  packet,
  metadata: {},
  external_execution_auth_initial: 'pending_approval',
  internal_planner_capability_source: 'locked_run_text',
});
ensureExecutionRunDispatched(run, {});
assert.equal(getExecutionRunById(run.run_id).outbound_dispatch_state, 'not_started');
authorizeExternalExecutionForRun(run.run_id, { reason: 't' });
ensureExecutionRunDispatched(getExecutionRunById(run.run_id), {});
await new Promise((r) => setTimeout(r, 150));
const st = getExecutionRunById(run.run_id).outbound_dispatch_state;
assert.ok(['in_progress', 'partial', 'completed', 'failed'].includes(st), `after auth dispatch moves state, got ${st}`);

await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.EXECUTION_RUNS_FILE;

console.log('ok: vnext13_1_founder_kernel_final_lock');
