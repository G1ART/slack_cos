/**
 * W13-B — Supabase 운영 모드 + eligibility entry 없음 → live_openai 시나리오 러너 inconclusive.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const prevLive = process.env.COS_SCENARIO_LIVE_OPENAI;
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-w13b-test';
process.env.COS_SCENARIO_LIVE_OPENAI = '1';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_block_'));
const prevCwd = process.cwd();
process.chdir(tmp);

try {
  const { runScenarioProofLive } = await import('../src/founder/scenarioProofLiveRunner.js');
  const out = await runScenarioProofLive({
    runMode: 'live_openai',
    writeToDisk: false,
    writers: { github: { write: async () => ({}) } },
  });
  assert.equal(out.runs.length, 2);
  for (const r of out.runs) {
    assert.ok(r.envelope);
    assert.equal(r.envelope.outcome, 'inconclusive');
    assert.equal(
      r.envelope.failure_classification.resolution_class,
      'tenancy_or_binding_ambiguity',
    );
    assert.match(r.envelope.failure_classification.human_gate_reason || '', /rehearsal/);
  }
} finally {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevUrl == null) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prevUrl;
  if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  if (prevLive == null) delete process.env.COS_SCENARIO_LIVE_OPENAI;
  else process.env.COS_SCENARIO_LIVE_OPENAI = prevLive;
}

console.log('test-rehearsal-gate-supabase-blocks-when-no-safe-target: ok');
