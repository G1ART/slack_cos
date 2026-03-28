#!/usr/bin/env node
/** `커서결과기록` 구조화 경로 E2E 스모크 — 실제 parse/resolve + AWQ 증거 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-cr-smoke-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.WORK_ITEMS_FILE = path.join(tmpDir, 'work-items.json');
process.env.WORK_RUNS_FILE = path.join(tmpDir, 'work-runs.json');
process.env.AGENT_WORK_QUEUE_FILE = path.join(tmpDir, 'agent-work-queue.json');

for (const f of [
  process.env.WORK_ITEMS_FILE,
  process.env.WORK_RUNS_FILE,
  process.env.AGENT_WORK_QUEUE_FILE,
]) {
  await fs.writeFile(f, '[]', 'utf8');
}

const { initStoreCore } = await import('../src/storage/core/index.js');
initStoreCore({ storageMode: 'json' });

const { createWorkItem } = await import('../src/features/workItems.js');
const { createWorkRun, getWorkRun, getLatestCursorRunForWork } = await import('../src/features/workRuns.js');
const { getWorkItem } = await import('../src/features/workItems.js');
const { enqueueFromDecisionPick, getAgentWorkQueueItem } = await import('../src/features/agentWorkQueue.js');
const { runInboundStructuredCommands } = await import('../src/features/runInboundStructuredCommands.js');

function parseWorkToken(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.trim().match(new RegExp(`^${escaped}\\s+([^\\s]+)`));
  if (!match) return null;
  return match[1];
}

function parseCursorResultRecord(text) {
  const m = text.trim().match(/^커서결과기록\s+([^\s]+)\s+(.+)$/);
  if (!m) return null;
  return { idToken: m[1], summary: m[2].trim() };
}

async function resolveCursorRunFromToken(idToken) {
  const runDirect = await getWorkRun(idToken);
  if (runDirect) {
    if (runDirect.tool_key === 'cursor') return { run: runDirect, via: 'run_id' };
    return { run: null, via: 'wrong_tool', wrongRun: runDirect };
  }
  const item = await getWorkItem(idToken);
  if (item) {
    const run = await getLatestCursorRunForWork(item.id);
    if (run) return { run, via: 'work_id' };
    return { run: null, via: 'work_id', workId: item.id };
  }
  return { run: null, via: 'unknown' };
}

function baseStructuredCtx() {
  return {
    metadata: {},
    channelContext: null,
    projectContext: null,
    envKey: 'dev',
    MODEL: 'm',
    RUNTIME_MODE: 'local',
    makeId: () => 'x',
    formatError: (e) => String(e),
    AGENT_OPTIONS: {},
    formatGithubIssuePublishSuccessLines: () => '',
    formatGithubIssuePersistFailedLines: () => '',
    parseDecisionRecord: () => null,
    parseLessonRecord: () => null,
    formatDecisionSaved: () => '',
    formatLessonSaved: () => '',
    formatRecentDecisions: () => '',
    formatRecentLessons: () => '',
    parseRecentCount: () => 5,
    parseDays: () => 7,
    parseWorkToken,
    parseChannelSetting: () => null,
    parseProjectSetting: () => null,
    parseWorkAssign: () => null,
    parseWorkBlock: () => null,
    parsePlanReject: () => null,
    parsePlanBlockCmd: () => null,
    parseWorkRevisionRequest: () => null,
    parseRepoSetting: () => null,
    parseDbSetting: () => null,
    parseGithubMergeReject: () => null,
    parseRollbackReject: () => null,
    parseResultRegister: () => null,
    parseCursorResultRecord,
    resolveCursorRunFromToken,
    parseResultReject: () => null,
    parseBlockedRun: () => null,
  };
}

const work = await createWorkItem({
  title: 'cursor structured smoke',
  brief: 'smoke',
  tool_key: 'cursor',
  assigned_tool: 'cursor',
  status_override: 'in_progress',
  approval_status_override: 'not_required',
});

const run = await createWorkRun({
  work_id: work.id,
  project_key: work.project_key,
  tool_key: 'cursor',
  adapter_type: 'cursor',
  dispatch_payload: { smoke: true },
  dispatch_target: 'handoff/smoke.md',
});

const awq = await enqueueFromDecisionPick({
  packet_id: 'PKT-cr-smoke',
  option_id: 'opt_cr',
  linked_work_ids: [work.id],
  linked_run_ids: [run.run_id],
  slack_source: {},
});

let out = await runInboundStructuredCommands({
  ...baseStructuredCtx(),
  trimmed: `커서결과기록 ${run.run_id} 패치 완료 npm test 통과`,
});
assert.ok(typeof out === 'string' && out.includes('반영 완료'), out);
assert.ok(out.includes(awq.id) && out.includes('cursor_result'), out);
let row = await getAgentWorkQueueItem(awq.id);
assert.ok(row?.proof_refs?.some((p) => String(p).startsWith(`cursor_result:${run.run_id}:`)), row?.proof_refs);

const work2 = await createWorkItem({
  title: 'cursor wrk-only awq',
  brief: 'b',
  tool_key: 'cursor',
  assigned_tool: 'cursor',
  status_override: 'in_progress',
  approval_status_override: 'not_required',
});
const run2 = await createWorkRun({
  work_id: work2.id,
  project_key: work2.project_key,
  tool_key: 'cursor',
  adapter_type: 'cursor',
  dispatch_payload: {},
  dispatch_target: 'h2.md',
});
const awq2 = await enqueueFromDecisionPick({
  packet_id: 'PKT-cr-fb',
  option_id: 'o2',
  linked_work_ids: [work2.id],
  slack_source: {},
});
assert.ok(!awq2.linked_run_id);

out = await runInboundStructuredCommands({
  ...baseStructuredCtx(),
  trimmed: `커서결과기록 ${run2.run_id} 완료 처리`,
});
assert.ok(out.includes('반영 완료'), out);
assert.ok(out.includes(awq2.id) && out.includes('WRK 연결'), out);
row = await getAgentWorkQueueItem(awq2.id);
assert.ok(row?.proof_refs?.some((p) => String(p).includes(run2.run_id)), row?.proof_refs);

await fs.rm(tmpDir, { recursive: true }).catch(() => {});
console.log('ok: cursor_result_structured_smoke');
