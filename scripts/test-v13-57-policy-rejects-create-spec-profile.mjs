/**
 * vNext.13.57 — Live-only execution profile rejects create_spec at adapter boundary (explicit policy, not invalid_payload).
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE } from '../src/founder/toolsBridge.js';
import { stashDelegateEmitPatchContext, __resetDelegateEmitPatchStashForTests } from '../src/founder/delegateEmitPatchStash.js';
import { getExecutionProfileForThread, evaluateCursorActionAgainstProfile } from '../src/founder/executionProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
assert.equal(r.status, 'blocked');
assert.equal(r.policy_rejection, true);
assert.equal(r.rejection_kind, 'execution_profile');
assert.ok(String(r.result_summary || '').includes('blocked / policy'));
assert.ok(String(r.result_summary || '').includes(CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE));

delete process.env.COS_RUN_STORE;
console.log('test-v13-57-policy-rejects-create-spec-profile: ok');
