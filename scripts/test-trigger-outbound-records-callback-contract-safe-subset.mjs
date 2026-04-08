/**
 * vNext.13.53 — trigger_outbound_callback_contract ops row: allowlisted fields only (no full URL host, no secret values).
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { recordOpsSmokeTriggerCallbackContract, __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-trigger-cb-contract');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_cb_contract';
process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
process.env.PUBLIC_BASE_URL = 'https://cos-redacted-host.example';
process.env.CURSOR_AUTOMATION_CALLBACK_PATH = '/webhooks/cursor';
process.env.CURSOR_WEBHOOK_SECRET = 'whsec_test_secret_value________________';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://cursor-hooks.example/hook';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetOpsSmokeSessionCacheForTests();

const tk = 'mention:trigger:cb_contract:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_cb',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_cb',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

await recordOpsSmokeTriggerCallbackContract({
  env: process.env,
  runId: String(run.id),
  threadKey: tk,
  smoke_session_id: 'sess_cb_contract',
  invoked_tool: 'cursor',
  invoked_action: 'emit_patch',
});

const evs = await listCosRunEventsForRun(String(run.id), 40);
const row = evs.find((e) => e.payload?.phase === 'trigger_outbound_callback_contract');
assert.ok(row, 'expected trigger_outbound_callback_contract phase');
const pl = row.payload || {};
assert.equal(pl.callback_contract_present, true);
assert.equal(pl.callback_url_field_name, 'callbackUrl');
assert.equal(pl.callback_secret_field_name, 'webhookSecret');
assert.ok(Array.isArray(pl.callback_hints_field_names));
assert.ok(pl.callback_url_path_only.includes('/webhooks/cursor'));
assert.equal(pl.callback_secret_present, true);
assert.equal(pl.selected_trigger_endpoint_family, 'cursor_automation_host');
const blob = JSON.stringify(pl);
assert.ok(!blob.includes('whsec_'), 'secret value must not appear in ops payload');
assert.ok(!blob.includes('cos-redacted-host.example'), 'callback host must not appear in ops payload');

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED;
delete process.env.PUBLIC_BASE_URL;
delete process.env.CURSOR_WEBHOOK_SECRET;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_CALLBACK_PATH;
delete process.env.COS_RUN_STORE;

console.log('test-trigger-outbound-records-callback-contract-safe-subset: ok');
