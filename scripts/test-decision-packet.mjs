#!/usr/bin/env node
/** M2b+M3 — decision packet · thread tail · short reply · agent work queue · 승인 매트릭스 v1 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), `cos-thread-tail-${process.pid}.json`);
process.env.THREAD_DECISION_TAIL_FILE = tmp;
const tmpWq = path.join(os.tmpdir(), `cos-agent-wq-${process.pid}.json`);
process.env.AGENT_WORK_QUEUE_FILE = tmpWq;

const {
  buildThinDecisionPacket,
  formatDecisionPacketSlack,
  parseDecisionShortReply,
  saveThreadDecisionTail,
  loadThreadDecisionTail,
  tryFinalizeDecisionShortReply,
} = await import('../src/features/decisionPackets.js');
const { evaluateApprovalPolicy, evaluateThinApprovalMatrix } = await import(
  '../src/features/approvalMatrixStub.js'
);

const p = buildThinDecisionPacket('테스트 주제');
assert.ok(p.packet_id.startsWith('PKT-'), 'packet_id prefix');
assert.ok(formatDecisionPacketSlack(p).includes('테스트 주제'));
assert.ok(formatDecisionPacketSlack(p).includes('opt_1'));
assert.equal(p.options[0].risk_level, 'low');
assert.equal(p.options[1].risk_level, 'high');

assert.equal(parseDecisionShortReply('1안', p).kind, 'pick');
assert.equal(parseDecisionShortReply('1안', p).option_id, 'opt_1');
assert.equal(parseDecisionShortReply('2안으로 가자', p).option_id, 'opt_2');
assert.equal(parseDecisionShortReply('보류', p).kind, 'defer');
assert.equal(parseDecisionShortReply('더 빠른 쪽', p).option_id, 'opt_1');
assert.equal(parseDecisionShortReply('비용 적은 쪽', p).option_id, 'opt_2');
assert.equal(parseDecisionShortReply('계획상세 PLN-1', p).kind, 'unknown');

const polDevLow = evaluateApprovalPolicy({
  action_type: 'decision_pick',
  environment_key: 'dev',
  env_profile_risk: 'low',
  selected_option: p.options[0],
});
assert.equal(polDevLow.tier, 'cos_approval_only');

const polDevHigh = evaluateApprovalPolicy({
  action_type: 'decision_pick',
  environment_key: 'dev',
  env_profile_risk: 'low',
  selected_option: p.options[1],
});
assert.equal(polDevHigh.tier, 'executive_approval_required');
assert.ok(polDevHigh.escalation_reasons?.includes('option_risk_level=high'));

const polProdLow = evaluateApprovalPolicy({
  action_type: 'decision_pick',
  environment_key: 'prod',
  env_profile_risk: 'high',
  selected_option: p.options[0],
});
assert.equal(polProdLow.tier, 'executive_approval_required');

assert.equal(evaluateThinApprovalMatrix({ action_type: 'decision_defer' }).tier, 'auto_allowed');

const meta = { channel: 'C1', user: 'U1', ts: '1.0', source_type: 'channel' };
await saveThreadDecisionTail('ch:C1:t:1.0', p);
const loaded = await loadThreadDecisionTail('ch:C1:t:1.0');
assert.ok(loaded && loaded.packet_id === p.packet_id);

const fin = await tryFinalizeDecisionShortReply('1안', meta);
assert.ok(fin && fin.text.includes('opt_1'));
assert.equal(fin.packet_id, p.packet_id);
assert.ok(fin.work_queue_id && String(fin.work_queue_id).startsWith('AWQ-'), 'work_queue_id');
assert.ok(fin.text.includes('cos_approval_only'), fin.text);

let qRaw = await fs.readFile(tmpWq, 'utf8');
let qArr = JSON.parse(qRaw);
assert.equal(qArr.length, 1);
assert.equal(qArr[0].packet_id, p.packet_id);
assert.equal(qArr[0].selected_option_id, 'opt_1');
assert.equal(qArr[0].status, 'queued');
assert.equal(qArr[0].approval_policy_tier, 'cos_approval_only');

const finHigh = await tryFinalizeDecisionShortReply('2안', meta);
assert.ok(finHigh.text.includes('executive_approval_required'), finHigh.text);
qRaw = await fs.readFile(tmpWq, 'utf8');
qArr = JSON.parse(qRaw);
assert.equal(qArr.length, 2);
assert.equal(qArr[1].selected_option_id, 'opt_2');
assert.equal(qArr[1].status, 'pending_executive');
assert.equal(qArr[1].approval_policy_tier, 'executive_approval_required');

const fin2 = await tryFinalizeDecisionShortReply('보류', meta);
assert.ok(fin2.text.includes('보류'));
assert.equal(fin2.work_queue_id ?? null, null);

await fs.unlink(tmp).catch(() => {});
await fs.unlink(tmpWq).catch(() => {});

console.log('ok: decision_packet m2b+m3+matrix_v1');
