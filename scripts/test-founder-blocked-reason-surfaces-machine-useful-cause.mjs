import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { invokeExternalTool, EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD } from '../src/founder/toolsBridge.js';

__resetCosRunMemoryStore();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-emit-patch-gate-summary');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/emit-patch-gate';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer test';

const r = await invokeExternalTool(
  {
    tool: 'cursor',
    action: 'emit_patch',
    payload: { title: 'only title', body: 'no ops array' },
  },
  { threadKey: 'mention:gate:1', packetId: 'pkt_gate' },
);

assert.equal(r.status, 'blocked');
assert.equal(r.blocked_reason, EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD);
assert.ok(
  String(r.exact_failure_code || '').includes('emit_patch') ||
    String(r.result_summary || '').includes(EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD),
  'exact assembly failure surfaced',
);
assert.ok(Array.isArray(r.missing_required_fields) && r.missing_required_fields.length > 0, 'missing contract fields');

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-founder-blocked-reason-surfaces-machine-useful-cause: ok');
