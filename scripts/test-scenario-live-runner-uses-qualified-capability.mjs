/**
 * W12-D — 어떤 sink 도 live_verified 상태가 아니면 라이브 리허설이 bounded block 으로 끊긴다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.COS_RUN_STORE = 'memory';
process.env.COS_SCENARIO_LIVE_OPENAI = '1';
process.env.COS_LIVE_BINDING_WRITERS = '1';

const repoRoot = process.cwd();
const ledgerPath = path.join(repoRoot, 'ops', 'live_binding_capability_qualifications.json');
let backup = null;
if (fs.existsSync(ledgerPath)) backup = fs.readFileSync(ledgerPath, 'utf8');
try {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(
    ledgerPath,
    JSON.stringify(
      {
        schema_version: 1,
        sinks: {
          github: { qualification_status: 'unverified' },
          supabase: { qualification_status: 'conservative' },
          vercel: { qualification_status: 'conservative' },
          openai: { qualification_status: 'conservative' },
        },
      },
      null,
      2,
    ),
  );

  const { runScenarioProofLive } = await import('../src/founder/scenarioProofLiveRunner.js');
  const res = await runScenarioProofLive({
    runMode: 'live_openai',
    writers: { github: {}, supabase: {}, vercel: {}, openai: {} },
    scenarios: ['scenario_1_multi_project_spinup'],
  });
  assert.equal(res.runs.length, 1);
  const env = res.runs[0].envelope;
  assert.ok(env, 'envelope present');
  assert.equal(env.outcome, 'inconclusive');
  assert.equal(env.break_reason_cause, 'product_capability_missing');
  assert.equal(env.failure_classification.resolution_class, 'technical_capability_missing');
  console.log('test-scenario-live-runner-uses-qualified-capability: ok');
} finally {
  if (backup !== null) fs.writeFileSync(ledgerPath, backup);
  else if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath);
}
