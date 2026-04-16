/**
 * W8-B propagation engine — dry_run=true 기본, writer 가 있으면 smoke result 반환.
 * - propagation_run row 1 개, step row N 개 메모리 저장, status = verify_pending (dry) 또는 succeeded.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');

engine.__resetPropagationEngineMemoryForTests();

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'railway',
    secret_handling_mode: 'write_only',
    binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'github',
    secret_handling_mode: 'plain_readable',
    binding_name: 'acme/alpha-web',
  }),
];

const plan = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: reqs,
  existingBindings: [],
  sinkCapabilities: {
    railway: { supports_secret_write: true },
    github: { supports_secret_write: true },
  },
});

const smokeWriter = {
  write: async (req) => ({
    wrote_at: null,
    sink_ref: `${req.sink_system}:${req.binding_name || req.binding_requirement_kind}`,
    secret_handling_mode: req.secret_handling_mode,
    verification_kind: 'smoke',
    verification_result: 'ok',
    live: false,
  }),
};
const writers = { railway: smokeWriter, github: smokeWriter };

const result = await engine.executePropagationPlan({ plan, writers });
assert.equal(result.step_rows.length, 2);
assert.equal(result.status, 'verify_pending', 'dry_run default → verify_pending');
assert.equal(result.failure_resolution_class, null);
for (const row of result.step_rows) {
  assert.equal(row.verification_result, 'ok');
  assert.ok(row.sink_ref && row.sink_ref.length > 0);
}

// listRecent
const recent = await engine.listRecentPropagationRunsForSpace('ps_alpha');
assert.equal(recent.length, 1);
assert.equal(recent[0].run.status, 'verify_pending');
assert.equal(recent[0].steps.length, 2);

// dry_run=false → succeeded
engine.__resetPropagationEngineMemoryForTests();
const live = await engine.executePropagationPlan({ plan, writers, dry_run: false });
assert.equal(live.status, 'succeeded');

console.log('test-propagation-engine-dry-run-smoke: ok');
