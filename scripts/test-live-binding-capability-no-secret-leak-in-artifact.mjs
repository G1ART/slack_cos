/**
 * W12-A — qualify CLI 가 raw secret 값/토큰/URL 을 원장에 남기지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.COS_RUN_STORE = 'memory';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w12a-noleak-'));
const ledgerPath = path.join(tmpDir, 'qual.json');

const secretish =
  'Bearer ghp_abcdefghijklmnopqrstuvwxyz1234 and eyJabcdefghijklmnopqrst and https://secret.example.com/k';

const res = spawnSync(
  'node',
  [
    'scripts/qualify-live-binding-capability.mjs',
    '--sink',
    'github',
    '--mode',
    'fixture',
    '--verified-by',
    'op',
    '--notes',
    secretish,
    '--evidence-ref',
    `see ${secretish}`,
    '--ledger',
    ledgerPath,
    '--json',
  ],
  { encoding: 'utf8' },
);
assert.equal(res.status, 0, `exit 0 (stderr=${res.stderr})`);

const raw = fs.readFileSync(ledgerPath, 'utf8');

for (const pat of [
  /ghp_[A-Za-z0-9]{20,}/,
  /eyJ[a-zA-Z0-9_\-.]{10,}/,
  /https?:\/\/secret\.example\.com/,
]) {
  assert.equal(pat.test(raw), false, `no secret pattern ${pat}`);
}

// stdout 도 누출 없어야 함
const stdout = String(res.stdout || '');
for (const pat of [
  /ghp_[A-Za-z0-9]{20,}/,
  /eyJ[a-zA-Z0-9_\-.]{10,}/,
  /https?:\/\/secret\.example\.com/,
]) {
  assert.equal(pat.test(stdout), false, `no secret in stdout ${pat}`);
}

console.log('test-live-binding-capability-no-secret-leak-in-artifact: ok');
