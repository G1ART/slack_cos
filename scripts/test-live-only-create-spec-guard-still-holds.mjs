/**
 * vNext.13.79 — Live-only stash present: policy string create_spec_disallowed_in_live_only_mode must not appear in tool results.
 */
import assert from 'node:assert';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  stashDelegateEmitPatchContext,
  __resetDelegateEmitPatchStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dispatchSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src/founder/toolPlane/dispatchExternalToolCall.js'),
  'utf8',
);
assert.ok(!dispatchSrc.includes('create_spec_disallowed_in_live_only_mode'));

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-live-only-guard-still');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetDelegateEmitPatchStashForTests();

const tk = 'mention:live_only:guard:still';
stashDelegateEmitPatchContext(tk, {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_g',
  objective: 'narrow',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_g',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'g.txt',
        operation: 'create',
        content: 'c',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
});

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 't', body: 'b' } },
  { threadKey: tk },
);

assert.ok(!String(r.result_summary || '').includes('create_spec_disallowed_in_live_only_mode'));

delete process.env.COS_RUN_STORE;

console.log('test-live-only-create-spec-guard-still-holds: ok');
