/**
 * vNext.13.79 — Live-only thread: no create_spec_disallowed_in_live_only_mode policy path; create_spec is not blocked by that code.
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
assert.ok(!dispatchSrc.includes('CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE'));

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-live-only-create-spec-block');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetDelegateEmitPatchStashForTests();

const tk = 'mention:live_only:create_spec:block';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_lc',
  objective: 'narrow',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_lc',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'f.txt',
        operation: 'create',
        content: 'c',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
};

stashDelegateEmitPatchContext(tk, dispatch);

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 't', body: 'b' } },
  { threadKey: tk },
);

assert.ok(!String(r.result_summary || '').includes('create_spec_disallowed_in_live_only_mode'));

delete process.env.COS_RUN_STORE;

console.log('test-live-only-no-fallback-blocks-create-spec: ok');
