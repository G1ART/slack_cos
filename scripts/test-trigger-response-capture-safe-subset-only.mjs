import assert from 'node:assert';
import { buildSafeTriggerSmokeDetail } from '../src/founder/smokeOps.js';

process.env.CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH = 'data.run.id';
process.env.CURSOR_AUTOMATION_RESPONSE_STATUS_PATH = 'status';

const tr = {
  ok: true,
  status: 202,
  response_top_level_keys: ['data', 'status', 'meta', 'links'],
  trigger_status: 'accepted',
  external_run_id: 'provider_run_abcdefghijklmnop',
  automation_status_raw: 'SUCCEEDED',
  automation_branch_raw: 'refs/heads/smoke',
  external_url: 'https://api.cursor.com/internal/runs/ultra-secret-id',
};

const d = buildSafeTriggerSmokeDetail(tr);
const json = JSON.stringify(d);

const allowedKeys = new Set([
  'response_top_level_keys',
  'http_status',
  'trigger_status',
  'external_run_id_tail',
  'status_extracted',
  'branch_present',
  'url_present',
  'override_keys_used',
]);
assert.deepEqual(new Set(Object.keys(d)), allowedKeys, 'only safe trigger fields');

assert.ok(!json.includes('ultra-secret'), 'no full run id');
assert.ok(!json.includes('api.cursor.com'), 'no URL host');
assert.equal(d.external_run_id_tail, 'ijklmnop');
assert.ok(Array.isArray(d.override_keys_used));
assert.ok(d.override_keys_used.some((k) => String(k).includes('RUN_ID')));

delete process.env.CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH;
delete process.env.CURSOR_AUTOMATION_RESPONSE_STATUS_PATH;

console.log('test-trigger-response-capture-safe-subset-only: ok');
