/**
 * audit-parcel-ops-smoke-health: Supabase 없으면 skip exit 0.
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'audit-parcel-ops-smoke-health.mjs');

const env = {
  ...process.env,
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  COS_RUNTIME_SUPABASE_URL: '',
  COS_RUNTIME_SUPABASE_SERVICE_ROLE_KEY: '',
};

const r = spawnSync(process.execPath, [script, '--json'], { env, encoding: 'utf8' });
assert.equal(r.status, 0, r.stderr || r.stdout);
const j = JSON.parse(r.stdout.trim());
assert.equal(j.skipped, true);
assert.equal(j.ok, true);

console.log('test-audit-parcel-health-skips-without-supabase: ok');
