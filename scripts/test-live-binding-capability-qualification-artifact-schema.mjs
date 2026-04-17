/**
 * W12-A — qualify CLI 가 만드는 ops/live_binding_capability_qualifications.json 스키마 회귀.
 *
 * - schema_version, sinks, updated_at 존재
 * - sink 별 필드 shape
 * - qualification_status ∈ QUALIFICATION_STATUSES
 * - raw secret 값 패턴 0
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.COS_RUN_STORE = 'memory';

const { QUALIFICATION_STATUSES } = await import('../src/founder/liveBindingCapabilityRegistry.js');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w12a-artifact-'));
const ledgerPath = path.join(tmpDir, 'qual.json');

const res = spawnSync(
  'node',
  [
    'scripts/qualify-live-binding-capability.mjs',
    '--all',
    '--mode',
    'fixture',
    '--verified-by',
    'op_test',
    '--ledger',
    ledgerPath,
    '--json',
  ],
  { encoding: 'utf8' },
);

assert.equal(res.status, 0, `qualify CLI exit 0 (stderr=${res.stderr})`);

const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
assert.equal(parsed.schema_version, 1);
assert.ok(parsed.sinks && typeof parsed.sinks === 'object', 'sinks object');
assert.ok(typeof parsed.updated_at === 'string' && parsed.updated_at.length > 0, 'updated_at');

for (const [sink, row] of Object.entries(parsed.sinks)) {
  assert.ok(QUALIFICATION_STATUSES.includes(row.qualification_status), `${sink}.status valid`);
  assert.ok(typeof row.last_verified_at === 'string', `${sink}.last_verified_at string`);
  assert.ok(row.last_verified_mode === 'fixture' || row.last_verified_mode === 'live', `${sink}.mode`);
  assert.equal(row.verified_by, 'op_test', `${sink}.verified_by`);
}

const raw = fs.readFileSync(ledgerPath, 'utf8');
for (const pat of [/ghp_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_\-]{20,}/, /eyJ[a-zA-Z0-9_\-.]{10,}/]) {
  assert.equal(pat.test(raw), false, `no secret pattern ${pat}`);
}

console.log('test-live-binding-capability-qualification-artifact-schema: ok');
