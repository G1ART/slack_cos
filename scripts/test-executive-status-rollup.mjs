#!/usr/bin/env node
/** M2b — ask_status 운영 롤업: AWQ·스토어 집계 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { ensureStorage } from '../src/storage/jsonStore.js';
import { appendJsonRecord } from '../src/storage/jsonStore.js';

const tmpQ = path.join(os.tmpdir(), `cos-awq-rollup-${process.pid}.json`);
const tmpCws = path.join(os.tmpdir(), `cos-cws-rollup-${process.pid}.json`);
process.env.AGENT_WORK_QUEUE_FILE = tmpQ;
process.env.COS_WORKSPACE_QUEUE_FILE = tmpCws;

await ensureStorage();
await fs.writeFile(tmpQ, '[]', 'utf8');
await fs.writeFile(tmpCws, '[]', 'utf8');
await appendJsonRecord(tmpQ, {
  id: 'AWQ-rollup-test',
  kind: 'decision_follow_up',
  status: 'pending_executive',
  approval_policy_tier: 'executive_approval_required',
  packet_id: 'PKT-r',
  selected_option_id: 'opt_1',
  topic: 'rollup smoke',
  thread_key: null,
  linked_plan_ids: [],
  linked_work_ids: [],
  linked_run_ids: [],
  linked_work_id: null,
  linked_run_id: null,
  proof_refs: ['ci:https://example/ci/1'],
  blocker: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slack_source: {},
});

await appendJsonRecord(tmpCws, {
  id: 'CWS-rollup-spec',
  kind: 'spec_intake',
  status: 'pending_review',
  title: 'rollup CWS',
  body: '스모크 spec 본문',
  created_at: new Date().toISOString(),
  source: {},
  channel_context: null,
});

await appendJsonRecord(tmpCws, {
  id: 'CFB-rollup-fb',
  kind: 'customer_feedback',
  status: 'pending_review',
  title: 'rollup fb',
  body: '스모크 피드백',
  created_at: new Date().toISOString(),
  source: {},
  channel_context: null,
});

const { gatherExecutiveOperatingRollup, applyRollupToExecutiveStatusPacket } = await import(
  '../src/features/executiveStatusRollup.js'
);
const { buildThinExecutiveStatusPacket } = await import('../src/features/statusPackets.js');
const { tryExecutiveSurfaceResponse } = await import('../src/features/tryExecutiveSurfaceResponse.js');

const rollup = await gatherExecutiveOperatingRollup();
assert.ok(rollup.has_operating_data);
assert.ok(/pending_executive\s*:\s*1/u.test(rollup.progress_change), rollup.progress_change);
assert.ok(/실행 큐 \(CWS·spec\)/u.test(rollup.progress_change), rollup.progress_change);
assert.ok(/피드백 큐 \(CFB\)/u.test(rollup.progress_change), rollup.progress_change);
assert.ok(/실행 큐 \(CWS·spec\):[^\n]*pending_review\s*:\s*1/u.test(rollup.progress_change), rollup.progress_change);
assert.ok(/피드백 큐 \(CFB\):[^\n]*pending_review\s*:\s*1/u.test(rollup.progress_change), rollup.progress_change);
assert.ok(rollup.decisions_needed.some((d) => d.includes('승인')), rollup.decisions_needed);
assert.ok(
  rollup.decisions_needed.some((d) => d.includes('실행 대기') || d.includes('실행 전환')) ||
    rollup.cos_next_action.some((n) => n.includes('실행 대기') || n.includes('전환')),
  JSON.stringify({ decisions: rollup.decisions_needed, next: rollup.cos_next_action }),
);
assert.ok(
  rollup.decisions_needed.some((d) => d.includes('고객 피드백')) ||
    rollup.cos_next_action.some((n) => n.includes('피드백')),
  JSON.stringify({ decisions: rollup.decisions_needed, next: rollup.cos_next_action }),
);

const merged = applyRollupToExecutiveStatusPacket(
  buildThinExecutiveStatusPacket({ intent: 'ask_status' }),
  rollup,
);
assert.ok(merged.proof_refs.includes('ci:https://example/ci/1'));

const surf = await tryExecutiveSurfaceResponse('지금 상태');
assert.ok(surf && surf.text.includes('운영 스냅샷'), surf.text);
assert.ok(surf.text.includes('pending_executive'), surf.text);

await fs.unlink(tmpQ).catch(() => {});
await fs.unlink(tmpCws).catch(() => {});
console.log('ok: executive_status_rollup');
