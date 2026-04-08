/**
 * vNext.13.47b — Blocked reason is the stable machine token (not generic invalid_payload).
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  invokeExternalTool,
  DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
} from '../src/founder/toolsBridge.js';
import { __resetDelegateEmitPatchStashForTests } from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-delegate-missing-reason');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/delegate-missing-token';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetDelegateEmitPatchStashForTests();

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: { title: 'orphan' } },
  { threadKey: 'mention:machine_reason:1' },
);

assert.equal(r.status, 'blocked');
assert.equal(DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH, 'delegate_packets_missing_for_emit_patch');
assert.ok(String(r.result_summary || '').includes('delegate_packets_missing_for_emit_patch'));
assert.ok(!String(r.result_summary || '').includes('invalid_payload'));

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
delete process.env.COS_RUN_STORE;

console.log('test-blocked-reason-delegate-packets-missing-is-machine-generated: ok');
