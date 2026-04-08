/**
 * vNext.13.47b — Cloud emit_patch without packet-scoped invoke and without stashed narrow delegate → blocked (no automation trigger).
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH } from '../src/founder/toolsBridge.js';
import { __resetDelegateEmitPatchStashForTests } from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-delegate-first-block');
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/delegate-first-block';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetDelegateEmitPatchStashForTests();

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: {} },
  { threadKey: 'mention:delegate_first:block:1' },
);

assert.equal(r.status, 'blocked');
assert.ok(String(r.result_summary || '').includes(DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH));

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-cursor-emit-patch-direct-invoke-blocked-without-delegate-packets: ok');
