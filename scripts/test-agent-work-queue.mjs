#!/usr/bin/env node
/** M3 — agent work queue: enqueue · patch lifecycle · 패킷 링크 필드 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = path.join(os.tmpdir(), `cos-awq-${process.pid}.json`);
process.env.AGENT_WORK_QUEUE_FILE = tmp;

const {
  enqueueFromDecisionPick,
  patchAgentWorkQueueItem,
  listAgentWorkQueueRecent,
  linkAgentWorkQueueRunForWork,
  appendAgentWorkQueueProofByLinkedRun,
  appendAgentWorkQueueProofByLinkedWork,
} = await import('../src/features/agentWorkQueue.js');

const r = await enqueueFromDecisionPick({
  packet_id: 'PKT-test',
  option_id: 'opt_1',
  topic: '주제',
  thread_key: 'ch:C:t:1',
  linked_plan_ids: ['PLN-A'],
  linked_work_ids: ['WRK-B'],
  linked_run_ids: ['RUN-C'],
  slack_source: { channel: 'C', user: 'U' },
});

assert.ok(r.id.startsWith('AWQ-'));
assert.deepEqual(r.linked_plan_ids, ['PLN-A']);
assert.deepEqual(r.linked_work_ids, ['WRK-B']);
assert.equal(r.linked_work_id, 'WRK-B');
assert.equal(r.linked_run_id, 'RUN-C');
assert.equal(r.status, 'queued');

const rExec = await enqueueFromDecisionPick({
  packet_id: 'PKT-exec',
  option_id: 'opt_2',
  topic: '고위험',
  thread_key: 'ch:C:t:2',
  approval_policy_tier: 'executive_approval_required',
  slack_source: {},
});
assert.equal(rExec.status, 'pending_executive');
assert.equal(rExec.approval_policy_tier, 'executive_approval_required');

const u0 = await patchAgentWorkQueueItem(rExec.id, { status: 'queued' }, tmp);
assert.equal(u0?.status, 'queued');

const bad = await patchAgentWorkQueueItem(r.id, { status: 'nope' }, tmp);
assert.equal(bad, null);

const u1 = await patchAgentWorkQueueItem(r.id, { status: 'in_progress' }, tmp);
assert.equal(u1?.status, 'in_progress');

const u2 = await patchAgentWorkQueueItem(
  r.id,
  { status: 'blocked', blocker: '승인 대기', proof_refs_append: ['handoff:docs/x.md'] },
  tmp
);
assert.equal(u2?.status, 'blocked');
assert.equal(u2?.blocker, '승인 대기');
assert.ok(u2?.proof_refs?.includes('handoff:docs/x.md'));

const u3 = await patchAgentWorkQueueItem(
  r.id,
  { status: 'done', linked_work_id: 'WRK-B-updated' },
  tmp
);
assert.equal(u3?.status, 'done');
assert.equal(u3?.linked_work_id, 'WRK-B-updated');

const recent = await listAgentWorkQueueRecent(tmp, 10);
assert.equal(recent.length, 2);

const qLink = await enqueueFromDecisionPick({
  packet_id: 'PKT-link',
  option_id: 'opt_l',
  linked_work_ids: ['WRK-LINK-A'],
  slack_source: {},
});
const linked = await linkAgentWorkQueueRunForWork('WRK-LINK-A', 'RUN-LINK-42', tmp);
assert.ok(linked && linked.id === qLink.id);
assert.equal(linked.linked_run_id, 'RUN-LINK-42');

const qLink2 = await enqueueFromDecisionPick({
  packet_id: 'PKT-link2',
  option_id: 'opt_l2',
  linked_work_ids: ['WRK-LINK-A'],
  slack_source: {},
});
const linked2 = await linkAgentWorkQueueRunForWork('WRK-LINK-A', 'RUN-LINK-99', tmp);
assert.ok(linked2);
assert.equal(linked2.id, qLink2.id, '빈 run 슬롯이 있는 최신 행에 연결');
assert.equal(linked2.linked_run_id, 'RUN-LINK-99');

const linked3 = await linkAgentWorkQueueRunForWork('WRK-LINK-A', 'RUN-EXTRA', tmp);
assert.ok(
  linked3.proof_refs.some((p) => String(p).includes('RUN-EXTRA') && String(p).includes('dispatch_run:')),
  linked3
);

const qCr = await enqueueFromDecisionPick({
  packet_id: 'PKT-cr',
  option_id: 'opt_cr',
  linked_work_ids: ['WRK-CR'],
  linked_run_ids: ['RUN-CR-1'],
  slack_source: {},
});
assert.equal(qCr.linked_run_id, 'RUN-CR-1');
const crProof = await appendAgentWorkQueueProofByLinkedRun('RUN-CR-1', 'cursor_result:RUN-CR-1:patch_complete', tmp);
assert.ok(crProof && crProof.id === qCr.id, crProof);
assert.ok(crProof.proof_refs.some((p) => String(p).startsWith('cursor_result:RUN-CR-1:')), crProof.proof_refs);

const qWonly = await enqueueFromDecisionPick({
  packet_id: 'PKT-wonly',
  option_id: 'opt_wo',
  linked_work_ids: ['WRK-WONLY'],
  slack_source: {},
});
assert.ok(qWonly.linked_work_id === 'WRK-WONLY');
assert.ok(!qWonly.linked_run_id);
const wProof = await appendAgentWorkQueueProofByLinkedWork(
  'WRK-WONLY',
  'cursor_result:RUN-FALLBACK:patch_complete',
  { preferRunId: 'RUN-FALLBACK' },
  tmp,
);
assert.ok(wProof && wProof.id === qWonly.id, wProof);
assert.ok(
  wProof.proof_refs.some((p) => String(p).includes('RUN-FALLBACK')),
  wProof.proof_refs,
);

await fs.unlink(tmp).catch(() => {});

console.log('ok: agent_work_queue');
