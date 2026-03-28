/**
 * M2a+M3 — inbound turn JSONL trace (`packet_id`·`work_queue_id` nullable).
 */
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = path.join(os.tmpdir(), `cos-inbound-trace-${process.pid}-${Date.now()}.jsonl`);
process.env.INBOUND_TURN_TRACE_FILE = tmp;

const { runInboundTurnTraceScope } = await import('../src/features/inboundTurnTrace.js');
const { finalizeSlackResponse } = await import('../src/features/topLevelRouter.js');

await runInboundTurnTraceScope(
  { channel: 'C111', user: 'U222', ts: '1.0', source_type: 'channel' },
  '계획상세 PLN-TEST-01',
  async () => {
    finalizeSlackResponse({
      responder: 'query',
      text: 'ok',
      raw_text: 'x',
      normalized_text: '계획상세 PLN-TEST-01',
      command_name: '계획상세',
      target_id: 'PLN-TEST-01',
      query_match: true,
      council_blocked: true,
      response_type: 'not_found',
    });
    return 'ok';
  }
);

let raw = await fs.readFile(tmp, 'utf8');
let lines = raw.trim().split('\n').filter(Boolean);
if (lines.length !== 1) throw new Error(`expected 1 line, got ${lines.length}`);
let row = JSON.parse(lines[0]);
if (!row.turn_id || row.turn_id.length < 8) throw new Error('turn_id');
if (row.thread_key !== 'ch:C111:t:1.0') throw new Error(`thread_key: ${row.thread_key}`);
if (row.final_responder !== 'query') throw new Error(`responder: ${row.final_responder}`);
if (row.plan_id !== 'PLN-TEST-01') throw new Error(`plan_id: ${row.plan_id}`);
if (row.work_id != null) throw new Error('work_id should be null');
if (row.status !== 'ok') throw new Error(`status: ${row.status}`);
if (typeof row.duration_ms !== 'number') throw new Error('duration_ms');
if (row.packet_id != null) throw new Error('packet_id');
if (row.work_queue_id != null) throw new Error('work_queue_id');
if (row.input_text_normalized !== '계획상세 PLN-TEST-01') throw new Error('normalized');
if (row.response_type !== 'not_found') throw new Error(`response_type: ${row.response_type}`);

const tmpWq = path.join(os.tmpdir(), `cos-trace-wq-${process.pid}-${Date.now()}.jsonl`);
process.env.INBOUND_TURN_TRACE_FILE = tmpWq;

await runInboundTurnTraceScope(
  { channel: 'C7', user: 'U7', ts: '3.0', source_type: 'channel' },
  '1안',
  async () => {
    finalizeSlackResponse({
      responder: 'executive_surface',
      text: 'decision reply',
      raw_text: '1안',
      normalized_text: '1안',
      command_name: 'decision_reply',
      council_blocked: true,
      response_type: 'decision_reply_pick',
      packet_id: 'PKT-unit-test',
      work_queue_id: 'AWQ-unit-test',
    });
    return 'ok';
  }
);

raw = await fs.readFile(tmpWq, 'utf8');
lines = raw.trim().split('\n').filter(Boolean);
if (lines.length !== 1) throw new Error(`wq trace: expected 1 line, got ${lines.length}`);
row = JSON.parse(lines[0]);
if (row.packet_id !== 'PKT-unit-test') throw new Error(`trace packet_id: ${row.packet_id}`);
if (row.work_queue_id !== 'AWQ-unit-test') throw new Error(`trace work_queue_id: ${row.work_queue_id}`);
if (row.response_type !== 'decision_reply_pick') throw new Error(`response_type: ${row.response_type}`);

const tmp2 = path.join(os.tmpdir(), `cos-inbound-trace-2-${process.pid}-${Date.now()}.jsonl`);
process.env.INBOUND_TURN_TRACE_FILE = tmp2;

await runInboundTurnTraceScope(
  { channel: 'D99', user: 'U1', source_type: 'direct_message' },
  '업무승인 WRK-240101-01',
  async () => {
    finalizeSlackResponse({
      responder: 'structured',
      text: '[업무승인] ok',
      raw_text: '업무승인 WRK-240101-01',
      normalized_text: '업무승인 WRK-240101-01',
      command_name: '업무승인',
      council_blocked: true,
      response_type: 'structured_command',
    });
    return '[업무승인] ok';
  }
);

raw = await fs.readFile(tmp2, 'utf8');
lines = raw.trim().split('\n').filter(Boolean);
if (lines.length !== 1) throw new Error(`structured: expected 1 line, got ${lines.length}`);
row = JSON.parse(lines[0]);
if (row.final_responder !== 'structured') throw new Error(`structured responder: ${row.final_responder}`);
if (row.thread_key !== 'im:D99') throw new Error(`im thread: ${row.thread_key}`);
if (row.response_type !== 'structured_command') throw new Error(`structured response_type: ${row.response_type}`);
if (row.command_name !== '업무승인') throw new Error(`structured command_name: ${row.command_name}`);

const tmpSt = path.join(os.tmpdir(), `cos-trace-st-${process.pid}-${Date.now()}.jsonl`);
process.env.INBOUND_TURN_TRACE_FILE = tmpSt;

await runInboundTurnTraceScope(
  { channel: 'Cst', user: 'Ust', ts: '8.0', source_type: 'channel' },
  '지금 상태 보여줘',
  async () => {
    finalizeSlackResponse({
      responder: 'executive_surface',
      text: 'status packet slack body',
      raw_text: 'x',
      normalized_text: '지금 상태 보여줘',
      command_name: 'ask_status',
      council_blocked: true,
      response_type: 'ask_status',
      packet_id: null,
      status_packet_id: 'STP-trace-unit',
    });
    return 'ok';
  }
);

raw = await fs.readFile(tmpSt, 'utf8');
lines = raw.trim().split('\n').filter(Boolean);
if (lines.length !== 1) throw new Error(`status trace: expected 1 line, got ${lines.length}`);
row = JSON.parse(lines[0]);
if (row.status_packet_id !== 'STP-trace-unit') throw new Error(`status_packet_id: ${row.status_packet_id}`);
if (row.response_type !== 'ask_status') throw new Error(row.response_type);

process.env.INBOUND_TURN_TRACE_DISABLE = 'true';
const tmp3 = path.join(os.tmpdir(), `cos-inbound-trace-3-${process.pid}-${Date.now()}.jsonl`);
process.env.INBOUND_TURN_TRACE_FILE = tmp3;
const { runInboundTurnTraceScope: run2 } = await import('../src/features/inboundTurnTrace.js');
await run2({ channel: 'C1', user: 'U1', ts: '9', source_type: 'channel' }, 'x', async () => 1);
try {
  await fs.access(tmp3);
  const s = await fs.readFile(tmp3, 'utf8');
  if (s.length > 0) throw new Error('trace should not write when disabled');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

await fs.unlink(tmp).catch(() => {});
await fs.unlink(tmpWq).catch(() => {});
await fs.unlink(tmp2).catch(() => {});
await fs.unlink(tmpSt).catch(() => {});
await fs.unlink(tmp3).catch(() => {});

console.log('ok: inbound_turn_trace');
