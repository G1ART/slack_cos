/**
 * vNext.13.57 / 13.79 — Execution profile still marks create_spec as disallowed on live_only_emit_patch; adapter no longer emits CREATE_SPEC_DISALLOWED policy block.
 */
import assert from 'node:assert';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { stashDelegateEmitPatchContext, __resetDelegateEmitPatchStashForTests } from '../src/founder/delegateEmitPatchStash.js';
import { getExecutionProfileForThread, evaluateCursorActionAgainstProfile } from '../src/founder/executionProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
assert.ok(
  !fs.readFileSync(path.join(__dirname, '..', 'src/founder/toolsBridge.js'), 'utf8').includes('CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE'),
);

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-57-policy');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetDelegateEmitPatchStashForTests();
const tk = 'mention:v13_57_policy';
stashDelegateEmitPatchContext(tk, {
  ok: true,
  status: 'accepted',
  packets: [
    {
      preferred_action: 'emit_patch',
      live_patch: { path: 'a', operation: 'create', content: 'x', live_only: true, no_fallback: true },
    },
  ],
});

const profile = getExecutionProfileForThread(tk);
assert.equal(profile.id, 'live_only_emit_patch');
const pol = evaluateCursorActionAgainstProfile(profile, 'create_spec');
assert.equal(pol.ok, false);

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 't', body: 'b' } },
  { threadKey: tk },
);
assert.ok(!String(r.result_summary || '').includes('create_spec_disallowed_in_live_only_mode'));
assert.notEqual(r.policy_rejection, true);

delete process.env.COS_RUN_STORE;
console.log('test-v13-57-policy-rejects-create-spec-profile: ok');
