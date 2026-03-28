#!/usr/bin/env node
/** M2b — status packet schema · render · audit JSONL */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = path.join(os.tmpdir(), `cos-stp-${process.pid}-${Date.now()}.jsonl`);
process.env.STATUS_PACKETS_JSONL_FILE = tmp;

const {
  buildThinExecutiveStatusPacket,
  formatExecutiveStatusPacketSlack,
  appendStatusPacketAudit,
} = await import('../src/features/statusPackets.js');

const p = buildThinExecutiveStatusPacket({ intent: 'unit', note: 'n1' });
assert.ok(p.status_packet_id.startsWith('STP-'), p.status_packet_id);
assert.equal(p.schema_version, 'exec_status_v1');

const slack = formatExecutiveStatusPacketSlack(p);
assert.ok(slack.includes('STP-') && slack.includes('exec_status_v1'), slack);

await appendStatusPacketAudit(p);
const raw = await fs.readFile(tmp, 'utf8');
const line = raw.trim().split('\n').filter(Boolean).pop();
assert.ok(line, 'audit line');
const j = JSON.parse(line);
assert.equal(j.type, 'status_packet');
assert.equal(j.status_packet_id, p.status_packet_id);

await fs.unlink(tmp).catch(() => {});
console.log('ok: status_packet');
