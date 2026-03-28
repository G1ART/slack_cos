#!/usr/bin/env node
/** M3 + 구조화 — 워크큐 전 생애주기 (게이트·보류·재개·착수·완료·취소) */
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const tmp = path.join(os.tmpdir(), `cos-awq-scmd-${process.pid}.json`);
process.env.AGENT_WORK_QUEUE_FILE = tmp;

function parseWorkToken(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.trim().match(new RegExp(`^${escaped}\\s+([^\\s]+)`));
  if (!match) return null;
  return match[1];
}

const { enqueueFromDecisionPick, getAgentWorkQueueItem } = await import('../src/features/agentWorkQueue.js');
const { runInboundStructuredCommands } = await import('../src/features/runInboundStructuredCommands.js');

const stubCtx = {
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
  parseCursorResultRecord: () => null,
  resolveCursorRunFromToken: async () => ({ run: null }),
  parseResultReject: () => null,
  parseBlockedRun: () => null,
};

const pe = await enqueueFromDecisionPick({
  packet_id: 'PKT-scmd',
  option_id: 'o',
  approval_policy_tier: 'executive_approval_required',
  linked_work_ids: ['WRK-SCMD'],
  slack_source: {},
});
assert.equal(pe.status, 'pending_executive');

let out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐실행허가 ${pe.id}`,
});
assert.ok(typeof out === 'string' && out.includes('queued') && out.includes('커서발행'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐보류 ${pe.id} 법무 시나리오 대기`,
});
assert.ok(typeof out === 'string' && out.includes('blocked'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐재개 ${pe.id}`,
});
assert.ok(typeof out === 'string' && out.includes('queued') && out.includes('blocked'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐취소 ${pe.id}`,
});
assert.ok(typeof out === 'string' && out.includes('cancelled'), out);

const q2 = await enqueueFromDecisionPick({
  packet_id: 'PKT-scmd2',
  option_id: 'a',
  linked_work_ids: ['WRK-2'],
  slack_source: {},
});
assert.equal(q2.status, 'queued');
out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐재개 ${q2.id}`,
});
assert.ok(typeof out === 'string' && out.includes('blocked') && out.includes('아님'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐보류 ${q2.id}`,
});
assert.ok(typeof out === 'string' && out.includes('blocked'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: '워크큐실행허가',
});
assert.ok(typeof out === 'string' && out.includes('형식'), out);

const q3 = await enqueueFromDecisionPick({
  packet_id: 'PKT-q3',
  option_id: 'x',
  linked_work_ids: ['WRK-3'],
  slack_source: {},
});
assert.equal(q3.status, 'queued');

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐착수 ${q3.id}`,
});
assert.ok(typeof out === 'string' && out.includes('in_progress'), out);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐증거 ${q3.id} mid-flight note`,
});
assert.ok(typeof out === 'string' && out.includes('워크큐증거') && out.includes('기록'), out);
let rowMid = await getAgentWorkQueueItem(q3.id, tmp);
assert.ok(rowMid?.proof_refs?.some((p) => String(p).includes('slack:') && String(p).includes('mid-flight')), rowMid);

const qRun = await enqueueFromDecisionPick({
  packet_id: 'PKT-runpf',
  option_id: 'rpf',
  linked_work_ids: ['WRK-RPF'],
  linked_run_ids: ['RUN-PF-1'],
  slack_source: {},
});
await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐착수 ${qRun.id}`,
});
out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: '러너증거 RUN-PF-1 CI passed',
});
assert.ok(typeof out === 'string' && out.includes('러너증거') && out.includes(qRun.id), out);
const rowRun = await getAgentWorkQueueItem(qRun.id, tmp);
assert.ok(rowRun?.proof_refs?.some((p) => String(p).includes('slack:') && String(p).includes('CI passed')), rowRun);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐완료 ${q3.id} proof:npm-test-ok`,
});
assert.ok(typeof out === 'string' && out.includes('done'), out);
const rowDone = await getAgentWorkQueueItem(q3.id, tmp);
assert.ok(Array.isArray(rowDone?.proof_refs) && rowDone.proof_refs.some((p) => String(p).includes('npm-test')), rowDone);

out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐완료 ${q3.id}`,
});
assert.ok(out.includes('done') && out.includes('in_progress'), out);

const q4 = await enqueueFromDecisionPick({
  packet_id: 'PKT-q4',
  option_id: 'y',
  linked_work_ids: ['WRK-4'],
  slack_source: {},
});
out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐완료 ${q4.id}`,
});
assert.ok(out.includes('in_progress'), out);

const pe3 = await enqueueFromDecisionPick({
  packet_id: 'PKT-pe3',
  option_id: 'z',
  approval_policy_tier: 'executive_approval_required',
  linked_work_ids: ['WRK-pe3'],
  slack_source: {},
});
out = await runInboundStructuredCommands({
  ...stubCtx,
  trimmed: `워크큐착수 ${pe3.id}`,
});
assert.ok(out.includes('실행허가'), out);

await fs.unlink(tmp).catch(() => {});

console.log('ok: work_queue_structured_cmd');
