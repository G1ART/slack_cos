import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';

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

assert.equal(r.status, 'degraded');
assert.ok(String(r.result_summary || '').includes('cursor_automation_emit_patch_v1'), 'contract name in summary');
assert.ok(
  String(r.result_summary || '').includes('missing:') || String(r.next_required_input || '').includes('ops'),
  'missing fields surfaced',
);

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-founder-blocked-reason-surfaces-machine-useful-cause: ok');
