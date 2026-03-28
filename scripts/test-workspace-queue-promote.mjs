#!/usr/bin/env node
/** 실행 큐 → PLN·WRK 승격 (`실행큐계획화`) 스모크 — tmp 스토어 */
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-promo-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmpDir, 'cos-workspace-queue.json');
process.env.PLANS_FILE = path.join(tmpDir, 'plans.json');
process.env.WORK_ITEMS_FILE = path.join(tmpDir, 'work-items.json');

await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLANS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.WORK_ITEMS_FILE, '[]', 'utf8');

const { appendWorkspaceQueueItem } = await import('../src/features/cosWorkspaceQueue.js');
const {
  promoteWorkspaceQueueSpecToPlan,
  formatWorkspaceQueuePromoteSlack,
  findLatestPromotableWorkspaceQueueId,
} = await import('../src/features/workspaceQueuePromote.js');

const rec = await appendWorkspaceQueueItem({
  kind: 'spec_intake',
  body: '새 관리자 대시보드 — 결제 취소 버튼',
  metadata: { channel: 'C1', user: 'U1' },
  channelContext: 'general_cos',
});

const res = await promoteWorkspaceQueueSpecToPlan({
  queueId: rec.id,
  metadata: { channel: 'C1' },
  channelContext: 'general_cos',
  projectContext: null,
  envKey: 'dev',
});
assert.ok(res.ok, String(res.reason));
assert.ok(res.plan.plan_id.startsWith('PLN-'), res.plan.plan_id);
assert.ok(
  Array.isArray(res.plan.linked_work_items) && res.plan.linked_work_items.length >= 1,
  JSON.stringify(res.plan.linked_work_items),
);

const txt = formatWorkspaceQueuePromoteSlack({ plan: res.plan, queueItem: res.queueItem });
assert.ok(txt.includes('커서발행'), txt);
assert.ok(txt.includes(res.plan.plan_id), txt);

const dup = await promoteWorkspaceQueueSpecToPlan({
  queueId: rec.id,
  metadata: {},
  channelContext: null,
  projectContext: null,
  envKey: 'dev',
});
assert.equal(dup.ok, false);
assert.equal(dup.reason, 'already_promoted');

const older = await appendWorkspaceQueueItem({
  kind: 'spec_intake',
  body: '이전 스펙 — 나중에 승격',
  metadata: {},
  channelContext: null,
});
const newer = await appendWorkspaceQueueItem({
  kind: 'spec_intake',
  body: '최신 스펙',
  metadata: {},
  channelContext: null,
});
const pick = await findLatestPromotableWorkspaceQueueId();
assert.equal(pick, newer.id);
const chain = await promoteWorkspaceQueueSpecToPlan({
  queueId: pick,
  metadata: {},
  channelContext: null,
  projectContext: null,
  envKey: 'dev',
});
assert.ok(chain.ok);
const w0 = chain.plan.linked_work_items[0];
const itemsAfter = await (
  await import('../src/storage/jsonStore.js')
).readJsonArray(process.env.WORK_ITEMS_FILE);
const wi = itemsAfter.find((x) => x && x.id === w0);
assert.ok(wi && wi.source_workspace_queue_id === newer.id, JSON.stringify(wi));

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('ok: workspace_queue_promote');
