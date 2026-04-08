/**
 * vNext.13.50 — Live-only/no-fallback thread cannot cloud emit_patch with empty payload even when run_packet_id is set.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  invokeExternalTool,
  DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
} from '../src/founder/toolsBridge.js';
import {
  __resetDelegateEmitPatchStashForTests,
  __seedLiveOnlyNoFallbackThreadWithoutStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-live-only-hard-gate');
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/live-only-gate';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetDelegateEmitPatchStashForTests();

const tk = 'mention:live_only:hard_gate:1';
__seedLiveOnlyNoFallbackThreadWithoutStashForTests(tk);

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: {} },
  { threadKey: tk, cosRunId: 'cos_run_gate', packetId: 'packet_gate' },
);

assert.equal(r.status, 'blocked');
assert.equal(r.blocked_reason, DELEGATE_REQUIRED_BEFORE_EMIT_PATCH);
assert.ok(String(r.machine_hint || '').includes('live_only_emit_patch_requires_delegate_packets'));

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-live-only-direct-emit-patch-never-bypasses-delegate-after-hard-gate: ok');
