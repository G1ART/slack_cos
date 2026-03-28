#!/usr/bin/env node
/** start_project + COS_FAST_SPEC_PROMOTE — 한 턴에 CWS→PLN·WRK 스모크 */
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-fast-spec-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmpDir, 'cos-workspace-queue.json');
process.env.PLANS_FILE = path.join(tmpDir, 'plans.json');
process.env.WORK_ITEMS_FILE = path.join(tmpDir, 'work-items.json');
process.env.COS_FAST_SPEC_PROMOTE = '1';

await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLANS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.WORK_ITEMS_FILE, '[]', 'utf8');

const { tryExecutiveSurfaceResponse } = await import('../src/features/tryExecutiveSurfaceResponse.js');

const meta = { channel: 'CEXEC', user: 'UCEO' };
const out = await tryExecutiveSurfaceResponse('툴제작: 모바일 간편주문 미니앱 (MVP)', meta);
assert.equal(out.response_type, 'start_project');
assert.ok(out.text.includes('실행 큐에 적재'), out.text);
assert.ok(out.text.includes('COS_FAST_SPEC_PROMOTE'), out.text);
assert.ok(out.text.includes('실행 큐 → 계획·업무'), out.text);
assert.match(out.text, /PLN-/);
assert.match(out.text, /WRK-/);
assert.ok(out.text.includes('커서발행'), out.text);

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('ok: start_project_fast_promote');
