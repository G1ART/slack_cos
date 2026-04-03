#!/usr/bin/env node
/** vNext.11 — 창업자 출력 금지어 + capability planner 스모크 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const BANNED = [
  '업무등록',
  '계획등록',
  '협의모드',
  '페르소나',
  '참여 페르소나',
  'responder',
  'council',
  'structured command',
  'planner mode',
  'command router',
];

function assertFounderClean(text, label) {
  const low = String(text || '').toLowerCase();
  for (const w of BANNED) {
    assert.ok(!low.includes(w.toLowerCase()), `${label} must not include "${w}"`);
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v11-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'q.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'p.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');
const { openProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');
const { extractRunCapabilities } = await import('../src/orchestration/runCapabilityExtractor.js');
const { planExecutionRoutesForRun } = await import('../src/orchestration/planExecutionRoutes.js');
const {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
} = await import('../src/features/executionRun.js');

async function founderDm(text, callText) {
  const meta = {
    source_type: 'direct_message',
    channel: 'Dv11',
    user: 'Uv11',
    ts: String(Math.random()),
    slack_route_label: 'dm_ai_router',
    callText,
  };
  openProjectIntakeSession(meta, { goalLine: 'vNext11 회귀 스레드' });
  return founderRequestPipeline({ text, metadata: meta, route_label: 'dm_ai_router' });
}

/* Founder outputs */
const outSha = await founderDm('현재 SHA 버전이 뭔지 출력해줘.', async () => 'NOPE');
assert.ok(outSha.text.includes('SHA'), 'sha response');
assertFounderClean(outSha.text, 'sha');

const outCur = await founderDm('Cursor 상태는 어때?', async () => 'NOPE');
assertFounderClean(outCur.text, 'cursor');

const outSb = await founderDm('Supabase 연결 상태는 어때?', async () => 'NOPE');
assertFounderClean(outSb.text, 'supabase');

const outHand = await founderDm('왜 아직도 handoff로 빠져?', async () => 'NOPE');
assertFounderClean(outHand.text, 'handoff explainer');

const outVague = await founderDm('그냥 궁금한 게 있는데요.', async () => '짧게 되물을게요. 어떤 제품 맥락인가요?');
assertFounderClean(outVague.text, 'natural partner');

/* Planner */
clearExecutionRunsForTest();
const packetUi = createExecutionPacket({
  thread_key: 'ch:V11:ui:1',
  goal_line: 'UI 카피와 인터랙션 라벨만 다듬고 싶어',
  locked_scope_summary: '카피',
  includes: ['문구'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const runUi = createExecutionRun({
  packet: packetUi,
  metadata: {},
  task_kind: 'task',
  external_execution_auth_initial: 'authorized',
  internal_planner_capability_source: 'locked_run_text',
});
const capUi = extractRunCapabilities(runUi);
assert.equal(capUi.research_only, false);
assert.equal(capUi.uiux_design, true);
assert.equal(capUi.db_schema, false);

clearExecutionRunsForTest();
const packetDb = createExecutionPacket({
  thread_key: 'ch:V11:db:1',
  goal_line: 'Supabase에 user 테이블 마이그레이션 추가',
  locked_scope_summary: 'schema',
  includes: ['migration'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const runDb = createExecutionRun({
  packet: packetDb,
  metadata: {},
  task_kind: 'task',
  external_execution_auth_initial: 'authorized',
  internal_planner_capability_source: 'locked_run_text',
});
const capDb = extractRunCapabilities(runDb);
assert.equal(capDb.db_schema, true);

clearExecutionRunsForTest();
const packetRs = createExecutionPacket({
  thread_key: 'ch:V11:rs:1',
  goal_line: '경쟁사 벤치마크만 먼저 알고 싶어',
  locked_scope_summary: '벤치',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const runRs = createExecutionRun({
  packet: packetRs,
  metadata: {},
  task_kind: 'task',
  external_execution_auth_initial: 'authorized',
  internal_planner_capability_source: 'locked_run_text',
});
const capRs = extractRunCapabilities(runRs);
assert.equal(capRs.research_only, true);
assert.equal(capRs.fullstack_code, false);

const planRs = planExecutionRoutesForRun(runRs, null);
assert.ok(planRs.route_decisions.some((d) => d.capability === 'research'));
assert.ok(!planRs.route_decisions.some((d) => d.selected_provider === 'github'));

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext11_founder_and_planner');
