/**
 * W12-A — unverified/stale sink 은:
 *   1) propagation plan 의 verification_kind 가 maxAllowedVerificationKind 이하로 강등
 *   2) engine 에서 writer 가 live=true 로 리턴하더라도 not_applicable + technical_capability_missing
 *
 * conservative(default, no ledger) 는 legacy 호환성을 위해 plan 단에서 강등하지 않지만
 * engine 은 live_verified 가 아니면 live write 를 막는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.COS_RUN_STORE = 'memory';

// unverified ledger fixture 를 전용 경로에 심고 CWD 를 임시로 가리키게 한다.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w12a-unverified-'));
const opsDir = path.join(tmpDir, 'ops');
fs.mkdirSync(opsDir, { recursive: true });
const ledgerFile = path.join(opsDir, 'live_binding_capability_qualifications.json');
fs.writeFileSync(
  ledgerFile,
  JSON.stringify(
    {
      schema_version: 1,
      sinks: {
        github: {
          qualification_status: 'unverified',
          last_verified_at: null,
          last_verified_mode: null,
          verified_by: null,
          verification_notes: null,
          evidence_ref: null,
        },
      },
      updated_at: new Date().toISOString(),
    },
    null,
    2,
  ),
  'utf8',
);
const prevCwd = process.cwd();
process.chdir(tmpDir);

try {
  const { buildPropagationPlan } = await import(
    path.join(prevCwd, 'src/founder/envSecretPropagationPlan.js')
  );
  const { executePropagationPlan, __resetPropagationEngineMemoryForTests } = await import(
    path.join(prevCwd, 'src/founder/envSecretPropagationEngine.js')
  );
  const { buildBindingRequirement } = await import(
    path.join(prevCwd, 'src/founder/bindingRequirements.js')
  );

  __resetPropagationEngineMemoryForTests();

  const reqs = [
    buildBindingRequirement({
      project_space_key: 'ps_a',
      binding_kind: 'env_requirement',
      source_system: 'operator',
      sink_system: 'github',
      secret_handling_mode: 'write_only',
      binding_name: 'OPENAI_API_KEY',
      required_human_action: null,
    }),
  ];

  const plan = buildPropagationPlan({
    project_space_key: 'ps_a',
    requirements: reqs,
    existingBindings: [{ binding_kind: 'env_requirement', binding_ref: 'OPENAI_API_KEY' }],
  });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].verification_kind, 'none', 'unverified → none');

  const writers = {
    github: {
      async write() {
        return {
          wrote_at: new Date().toISOString(),
          sink_ref: 'owner/repo',
          secret_handling_mode: 'write_only',
          verification_kind: 'none',
          verification_result: 'ok',
          live: true,
          failure_resolution_class: null,
        };
      },
    },
  };
  const result = await executePropagationPlan({ plan, writers, dry_run: false });
  assert.equal(result.step_rows.length, 1);
  const row = result.step_rows[0];
  assert.equal(row.verification_result, 'not_applicable', 'live write denied → not_applicable');
  assert.equal(row.failure_resolution_class, 'technical_capability_missing');

  console.log('test-live-binding-capability-unverified-limits-writes: ok');
} finally {
  process.chdir(prevCwd);
}
