#!/usr/bin/env node
/** vNext.13 — 제안 커널·승인 게이트·completion 단일 정본 회귀 스모크 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* T1: founder 블록에 레거시 라우터 없음 + 파이프라인 감사 필드 */
const appPath = path.join(__dirname, '..', 'app.js');
const appSrc = fs.readFileSync(appPath, 'utf8');
const start = appSrc.indexOf('if (founderRoute) {');
const end = appSrc.indexOf('// Constitutional pipeline v1.1 — work_object');
assert.ok(start !== -1 && end !== -1 && end > start);
const founderBlock = appSrc.slice(start, end);
assert.ok(!founderBlock.includes('runInboundCommandRouter'));
assert.ok(!founderBlock.includes('runInboundAiRouter'));

const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');
const { openProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');
const metaT1 = {
  source_type: 'direct_message',
  channel: 'Dv13t1',
  user: 'Uv13',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  callText: async () => '',
};
openProjectIntakeSession(metaT1, { goalLine: 'T1' });
const outT1 = await founderRequestPipeline({ text: '상태만 짧게', metadata: metaT1 });
assert.equal(outT1.trace.founder_classifier_used, false);
assert.equal(outT1.trace.founder_keyword_route_used, false);
assert.equal(outT1.trace.legacy_command_router_used, false);
assert.equal(outT1.trace.legacy_ai_router_used, false);

/* T2–T4: 제안 커널·실행 모드·proposal 기반 capability 추출 */
const { buildProposalFromFounderInput } = await import('../src/founder/founderProposalKernel.js');
const { synthesizeFounderContext } = await import('../src/founder/founderContextSynthesizer.js');
const { selectExecutionModeFromProposalPacket } = await import('../src/founder/executionModeFromProposalPacket.js');
const { extractCapabilitiesFromProposalPacket } = await import('../src/orchestration/runCapabilityExtractor.js');
const { buildSlackThreadKey } = await import('../src/features/slackConversationBuffer.js');

const ctx = (m) => synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m });

const samples = [
  ['플랫폼 MVP 빌드와 캘린더 기능을 구현해줘', 'platform'],
  ['경쟁 SaaS 벤치마킹해서 전략 메모로 정리', 'strategy'],
  ['이번 분기 예산 시나리오 3개와 런웨이 가정', 'budget'],
  ['IR 덱 구조 리뷰하고 투자자 톤에 맞게 메시지 다듬기', 'ir'],
];
for (const [text, _label] of samples) {
  const m = { source_type: 'direct_message', channel: `Dv13-${_label}`, user: 'U', ts: '2.0' };
  const p = buildProposalFromFounderInput({ rawText: text, contextFrame: ctx(m) });
  assert.ok(p.understood_request, `${_label} understood`);
  assert.ok(Array.isArray(p.cos_only_tasks) && p.cos_only_tasks.length, `${_label} cos_only`);
  assert.ok(p.proposed_roadmap.length, `${_label} roadmap`);
}

const pIr = buildProposalFromFounderInput({
  rawText: 'IR deck 다시 써줘',
  contextFrame: ctx({ source_type: 'direct_message', channel: 'Dir', user: 'U', ts: '3' }),
});
assert.equal(selectExecutionModeFromProposalPacket(pIr), 'COS_ONLY');

const pBench = buildProposalFromFounderInput({
  rawText: '경쟁사 벤치마킹해서 표로 정리해줘',
  contextFrame: ctx({ source_type: 'direct_message', channel: 'Db', user: 'U', ts: '4' }),
});
assert.equal(selectExecutionModeFromProposalPacket(pBench), 'INTERNAL_SUPPORT');

const caps = extractCapabilitiesFromProposalPacket(pBench);
assert.equal(caps.market_research, true);

const pExt = buildProposalFromFounderInput({
  rawText: '좋아, 이제 GitHub와 Supabase까지 실제로 실행해',
  contextFrame: ctx({ source_type: 'direct_message', channel: 'Dex', user: 'U', ts: '5' }),
});
assert.ok(pExt.external_execution_tasks.length);
assert.equal(selectExecutionModeFromProposalPacket(pExt), 'EXTERNAL_EXECUTION_REQUIRES_APPROVAL');

/* T5 + T6: 격리 스토리지 */
const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g1cos-v13-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'q.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'p.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.promises.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.promises.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.promises.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.promises.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
  getExecutionRunById,
  updateRunExternalExecutionAuthorization,
} = await import('../src/features/executionRun.js');
const { ensureExecutionRunDispatched, evaluateExecutionRunCompletion } = await import(
  '../src/features/executionDispatchLifecycle.js'
);
const { authorizeExternalExecutionForRun } = await import('../src/orchestration/approvalGate.js');

clearExecutionRunsForTest();
const packet2 = createExecutionPacket({
  thread_key: 'ch:V13:comp:1',
  goal_line: 'c',
  locked_scope_summary: 'c',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const runC = createExecutionRun({ packet: packet2, metadata: {} });
const ev = evaluateExecutionRunCompletion(runC.run_id);
assert.equal(ev.completion_source, 'truth_reconciliation');
assert.equal(ev.overall_status, 'pending');

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V13:gate:1',
  goal_line: 'gate test',
  locked_scope_summary: 't',
  includes: ['a'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const runG = createExecutionRun({ packet, metadata: {} });
updateRunExternalExecutionAuthorization(runG.run_id, { state: 'pending_approval', reason: 't5' });
ensureExecutionRunDispatched(runG, {});
assert.equal(getExecutionRunById(runG.run_id).outbound_dispatch_state, 'not_started');
authorizeExternalExecutionForRun(runG.run_id, { reason: 't5_ok' });
ensureExecutionRunDispatched(runG, {});
await new Promise((r) => setTimeout(r, 120));
assert.ok(
  ['in_progress', 'partial', 'completed', 'failed'].includes(
    getExecutionRunById(runG.run_id).outbound_dispatch_state,
  ),
  'authorized run leaves not_started',
);

await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_founder_proposal_kernel');
