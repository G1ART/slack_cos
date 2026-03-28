#!/usr/bin/env node
/** M4 — lineage: 턴 trace JSONL · 패킷 감사 · 워크큐 JSON */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmpJ = path.join(os.tmpdir(), `cos-dpjl-${process.pid}.jsonl`);
const tmpSt = path.join(os.tmpdir(), `cos-stpjl-${process.pid}.jsonl`);
const tmpQ = path.join(os.tmpdir(), `cos-awq-lin-${process.pid}.json`);
const tmpT = path.join(os.tmpdir(), `cos-itrlin-${process.pid}.jsonl`);
const tmpWsq = path.join(os.tmpdir(), `cos-wsq-lin-${process.pid}.json`);
process.env.DECISION_PACKETS_JSONL_FILE = tmpJ;
process.env.STATUS_PACKETS_JSONL_FILE = tmpSt;
process.env.AGENT_WORK_QUEUE_FILE = tmpQ;
process.env.INBOUND_TURN_TRACE_FILE = tmpT;
process.env.COS_WORKSPACE_QUEUE_FILE = tmpWsq;
await fs.writeFile(tmpWsq, '[]', 'utf8');

const {
  parseG1CosLineageToken,
  tryFinalizeG1CosLineageTransport,
  lookupDecisionPacketAuditRow,
  lookupTurnTraceRecord,
} = await import('../src/features/g1cosLineageTransport.js');
const { appendJsonRecord } = await import('../src/storage/jsonStore.js');
const { buildThinDecisionPacket: buildThin } = await import('../src/features/decisionPackets.js');
const {
  buildThinExecutiveStatusPacket,
  appendStatusPacketAudit,
} = await import('../src/features/statusPackets.js');

assert.equal(parseG1CosLineageToken('패킷 PKT-abc-123')?.id, 'PKT-abc-123');
assert.equal(parseG1CosLineageToken('packet PKT-x')?.kind, 'packet');
assert.equal(parseG1CosLineageToken('워크큐 AWQ-zz')?.id, 'AWQ-zz');
assert.equal(parseG1CosLineageToken('wq AWQ-a-b')?.kind, 'work_queue');
assert.equal(parseG1CosLineageToken('trace 11111111-1111-4111-8111-111111111111')?.kind, 'turn_trace');
assert.equal(parseG1CosLineageToken('추적 11111111-1111-4111-8111-111111111111')?.id, '11111111-1111-4111-8111-111111111111');
assert.equal(parseG1CosLineageToken('계획상세 PLN-1'), null);
assert.equal(parseG1CosLineageToken('실행 큐 CWS-lin-spec')?.kind, 'cos_workspace');
assert.equal(parseG1CosLineageToken('실행 큐 CWS-lin-spec')?.id, 'CWS-lin-spec');
assert.equal(parseG1CosLineageToken('고객 피드백 CFB-lin-fb')?.kind, 'cos_workspace');
assert.equal(parseG1CosLineageToken('고객 피드백 CFB-lin-fb')?.id, 'CFB-lin-fb');
assert.equal(parseG1CosLineageToken('상태 STP-xyz')?.kind, 'status_packet');
assert.equal(parseG1CosLineageToken('status STP-a')?.id, 'STP-a');

const turnLine = {
  turn_id: '11111111-1111-4111-8111-111111111111',
  thread_key: 'ch:C:t:7',
  channel_id: 'C',
  user_id: 'U',
  timestamp: new Date().toISOString(),
  input_text_normalized: '1안',
  final_responder: 'executive_surface',
  surface_intent: 'decision_reply',
  command_name: 'decision_reply',
  response_type: 'decision_reply_pick',
  packet_id: 'PKT-x',
  status_packet_id: 'STP-turn-drill',
  work_queue_id: 'AWQ-x',
  plan_id: null,
  work_id: null,
  run_id: null,
  approval_id: null,
  status: 'ok',
  duration_ms: 12,
  error: null,
};
await fs.writeFile(tmpT, `${JSON.stringify(turnLine)}\n`, 'utf8');
const tr = await lookupTurnTraceRecord('11111111-1111-4111-8111-111111111111', tmpT);
assert.ok(tr && tr.turn_id === turnLine.turn_id);
const th = await tryFinalizeG1CosLineageTransport('턴 11111111-1111-4111-8111-111111111111', {});
assert.ok(th && th.response_type === 'lineage_turn');
assert.ok(th.text.includes('turn_id') && th.text.includes('11111111-1111-4111-8111-111111111111'));
assert.ok(th.text.includes('response_type') && th.text.includes('decision_reply_pick'), th.text);
assert.ok(th.text.includes('STP-turn-drill') && th.text.includes('lineage:'), th.text);

const pkt = buildThin('lineage-test');
const auditLine = { type: 'decision_packet', recorded_at: new Date().toISOString(), ...pkt };
await fs.mkdir(path.dirname(tmpJ), { recursive: true });
await fs.writeFile(tmpJ, `${JSON.stringify(auditLine)}\n`, 'utf8');

const row = await lookupDecisionPacketAuditRow(pkt.packet_id, tmpJ);
assert.ok(row && row.packet_id === pkt.packet_id);

const hit = await tryFinalizeG1CosLineageTransport(`패킷 ${pkt.packet_id}`, {});
assert.ok(hit && hit.response_type === 'lineage_packet');
assert.ok(hit.text.includes('결정 패킷') && hit.text.includes(pkt.packet_id));

const stp = buildThinExecutiveStatusPacket({ intent: 'lineage-test' });
await appendStatusPacketAudit(stp, tmpSt);
assert.equal(parseG1CosLineageToken(`상태 ${stp.status_packet_id}`)?.id, stp.status_packet_id);
const stHit = await tryFinalizeG1CosLineageTransport(`상태 ${stp.status_packet_id}`, {});
assert.ok(stHit && stHit.response_type === 'lineage_status_packet');
assert.ok(stHit.text.includes(stp.status_packet_id), stHit.text);
assert.ok(stHit.text.includes('진행 변화') || stHit.text.includes('exec_status_v1'), stHit.text);
const stMiss = await tryFinalizeG1CosLineageTransport(
  '상태 STP-00000000-0000-4000-8000-000000000000',
  {},
);
assert.ok(stMiss && stMiss.response_type === 'lineage_status_packet_miss');

await appendJsonRecord(tmpQ, {
  id: 'AWQ-test-lin-1',
  kind: 'decision_follow_up',
  status: 'queued',
  approval_policy_tier: 'cos_approval_only',
  packet_id: pkt.packet_id,
  selected_option_id: 'opt_1',
  topic: 't',
  thread_key: 'ch:C:t:1',
  linked_plan_ids: [],
  linked_work_ids: ['WRK-LINE-99'],
  linked_run_ids: [],
  linked_work_id: 'WRK-LINE-99',
  linked_run_id: null,
  proof_refs: [],
  blocker: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slack_source: {},
});

const wqHit = await tryFinalizeG1CosLineageTransport('워크큐 AWQ-test-lin-1', {});
assert.ok(wqHit && wqHit.response_type === 'lineage_work_queue');
assert.ok(wqHit.text.includes('AWQ-test-lin-1'));
assert.ok(wqHit.text.includes('approval_policy_tier'), wqHit.text);
assert.ok(wqHit.text.includes('커서발행 WRK-LINE-99'), wqHit.text);
assert.ok(wqHit.text.includes('다음 액션'), wqHit.text);

const wqMiss = await tryFinalizeG1CosLineageTransport('워크큐 AWQ-nope-nope', {});
assert.ok(wqMiss && wqMiss.response_type === 'lineage_work_queue_miss');

await appendJsonRecord(tmpQ, {
  id: 'AWQ-test-lin-pe',
  kind: 'decision_follow_up',
  status: 'pending_executive',
  approval_policy_tier: 'executive_approval_required',
  packet_id: pkt.packet_id,
  selected_option_id: 'opt_2',
  topic: 'pe',
  thread_key: 'ch:C:t:2',
  linked_plan_ids: [],
  linked_work_ids: ['WRK-LINE-99'],
  linked_run_ids: [],
  linked_work_id: 'WRK-LINE-99',
  linked_run_id: null,
  proof_refs: [],
  blocker: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slack_source: {},
});

const listHit = await tryFinalizeG1CosLineageTransport('워크큐 목록', {});
assert.ok(listHit && listHit.response_type === 'lineage_work_queue_list');
assert.ok(listHit.text.includes('AWQ-test-lin-pe'), listHit.text);
assert.ok(listHit.text.includes('AWQ-test-lin-1'), listHit.text);
assert.ok(listHit.text.includes('실행 브리지'), listHit.text);
assert.ok(listHit.text.includes('커서발행 WRK-LINE-99'), listHit.text);

const pendHit = await tryFinalizeG1CosLineageTransport('wq pending', {});
assert.ok(pendHit && pendHit.response_type === 'lineage_work_queue_pending');
assert.ok(pendHit.text.includes('AWQ-test-lin-pe'), pendHit.text);
assert.ok(pendHit.text.includes('AWQ-test-lin-1'), pendHit.text);
assert.ok(pendHit.text.includes('승인 후'), pendHit.text);

const wqPeDrill = await tryFinalizeG1CosLineageTransport('워크큐 AWQ-test-lin-pe', {});
assert.ok(wqPeDrill && wqPeDrill.response_type === 'lineage_work_queue');
assert.ok(wqPeDrill.text.includes('워크큐실행허가 AWQ-test-lin-pe'), wqPeDrill.text);

await appendJsonRecord(tmpQ, {
  id: 'AWQ-test-lin-bl',
  kind: 'decision_follow_up',
  status: 'blocked',
  approval_policy_tier: null,
  packet_id: pkt.packet_id,
  selected_option_id: 'opt_x',
  topic: 'hold',
  thread_key: null,
  linked_plan_ids: [],
  linked_work_ids: ['WRK-BL-1'],
  linked_run_ids: [],
  linked_work_id: 'WRK-BL-1',
  linked_run_id: null,
  proof_refs: [],
  blocker: '외부 검토',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slack_source: {},
});
const wqBl = await tryFinalizeG1CosLineageTransport('워크큐 AWQ-test-lin-bl', {});
assert.ok(wqBl && wqBl.response_type === 'lineage_work_queue');
assert.ok(wqBl.text.includes('워크큐재개 AWQ-test-lin-bl'), wqBl.text);
assert.ok(wqBl.text.includes('외부 검토'), wqBl.text);

await appendJsonRecord(tmpQ, {
  id: 'AWQ-test-lin-ip',
  kind: 'decision_follow_up',
  status: 'in_progress',
  approval_policy_tier: null,
  packet_id: pkt.packet_id,
  selected_option_id: 'opt_y',
  topic: 'wip',
  thread_key: null,
  linked_plan_ids: [],
  linked_work_ids: ['WRK-IP-1'],
  linked_run_ids: ['RUN-LIN-IP'],
  linked_work_id: 'WRK-IP-1',
  linked_run_id: 'RUN-LIN-IP',
  proof_refs: [],
  blocker: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slack_source: {},
});
const wqIp = await tryFinalizeG1CosLineageTransport('워크큐 AWQ-test-lin-ip', {});
assert.ok(wqIp && wqIp.response_type === 'lineage_work_queue');
assert.ok(wqIp.text.includes('워크큐완료 AWQ-test-lin-ip'), wqIp.text);
assert.ok(wqIp.text.includes('워크큐증거'), wqIp.text);
assert.ok(wqIp.text.includes('러너증거 RUN-LIN-IP'), wqIp.text);

const listAfterIp = await tryFinalizeG1CosLineageTransport('워크큐 목록', {});
assert.ok(listAfterIp.text.includes('러너증거 RUN-LIN-IP'), listAfterIp.text);
assert.ok(listAfterIp.text.includes('COS_CI_HOOK'), listAfterIp.text);

await appendJsonRecord(tmpWsq, {
  id: 'CWS-lin-spec',
  kind: 'spec_intake',
  status: 'pending_review',
  title: 'lineage spec',
  body: 'spec body for lineage',
  created_at: new Date().toISOString(),
  source: {},
  channel_context: null,
});
await appendJsonRecord(tmpWsq, {
  id: 'CFB-lin-fb',
  kind: 'customer_feedback',
  status: 'pending_review',
  title: 'lineage fb',
  body: 'login slow',
  created_at: new Date().toISOString(),
  source: {},
  channel_context: null,
});

const wsSpecList = await tryFinalizeG1CosLineageTransport('실행 큐 목록', {});
assert.ok(wsSpecList && wsSpecList.response_type === 'lineage_workspace_spec_list');
assert.ok(wsSpecList.text.includes('CWS-lin-spec'), wsSpecList.text);

const wsFbList = await tryFinalizeG1CosLineageTransport('고객 피드백 목록', {});
assert.ok(wsFbList && wsFbList.response_type === 'lineage_workspace_feedback_list');
assert.ok(wsFbList.text.includes('CFB-lin-fb'), wsFbList.text);

const wsDrill = await tryFinalizeG1CosLineageTransport('고객 피드백 CFB-lin-fb', {});
assert.ok(wsDrill && wsDrill.response_type === 'lineage_workspace_intake');
assert.ok(wsDrill.text.includes('CFB-lin-fb') && wsDrill.text.includes('login slow'), wsDrill.text);

const wsMiss = await tryFinalizeG1CosLineageTransport('실행 큐 CWS-nope', {});
assert.ok(wsMiss && wsMiss.response_type === 'lineage_workspace_intake_miss');

await fs.unlink(tmpJ).catch(() => {});
await fs.unlink(tmpSt).catch(() => {});
await fs.unlink(tmpQ).catch(() => {});
await fs.unlink(tmpT).catch(() => {});
await fs.unlink(tmpWsq).catch(() => {});

console.log('ok: g1cos_lineage_transport');
