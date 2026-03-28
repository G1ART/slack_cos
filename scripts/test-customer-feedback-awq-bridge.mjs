#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { mkdtemp } from 'fs/promises';

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'g1cos-cfb-awq-'));
const qFile = path.join(tmpDir, 'cos-workspace-queue.json');
const awqFile = path.join(tmpDir, 'agent-work-queue.json');
process.env.COS_WORKSPACE_QUEUE_FILE = qFile;
process.env.AGENT_WORK_QUEUE_FILE = awqFile;
await fs.writeFile(qFile, '[]', 'utf8');
await fs.writeFile(awqFile, '[]', 'utf8');

const { appendCustomerFeedbackWithAwqDraft } = await import('../src/features/customerFeedbackAwqBridge.js');
const { readJsonArray } = await import('../src/storage/jsonStore.js');

const metaDev = { channel: 'C1', user: 'U1', ts: '1.1' };
const pack = await appendCustomerFeedbackWithAwqDraft({
  body: '로딩이 느려요',
  metadata: metaDev,
  channelContext: null,
});
assert.ok(pack.cfb.id.startsWith('CFB-'), pack.cfb);
assert.ok(pack.awq.id.startsWith('AWQ-'), pack.awq);
assert.equal(pack.awq.kind, 'feedback_follow_up');
assert.equal(pack.cfb.linked_awq_id, pack.awq.id);
const rows = await readJsonArray(qFile);
const cfbRow = rows.find((r) => r.id === pack.cfb.id);
assert.equal(cfbRow?.linked_awq_id, pack.awq.id);

await fs.writeFile(qFile, '[]', 'utf8');
await fs.writeFile(awqFile, '[]', 'utf8');
const metaProd = { channel: 'C1', user: 'U1', env_key: 'prod' };
const pack2 = await appendCustomerFeedbackWithAwqDraft({
  body: '결제 실패',
  metadata: metaProd,
  channelContext: null,
});
assert.equal(pack2.awq.status, 'pending_executive', pack2.awq);
assert.equal(pack2.policy.tier, 'executive_approval_required', pack2.policy.tier);

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('ok: customer_feedback_awq_bridge');
