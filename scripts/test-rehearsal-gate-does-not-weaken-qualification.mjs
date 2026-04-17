/**
 * W13-B × W12-D — rehearsal_eligibility 에 sandbox_safe entry 가 있더라도,
 * qualification ledger 에 live_verified sink 가 하나도 없다면 scenarioProofLiveRunner 는
 * 여전히 bounded inconclusive (product_capability_missing / technical_capability_missing) 로 차단한다.
 *
 * 즉 W13-B 는 W12-D 를 약화시키지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_noweaken_'));
const prevCwd = process.cwd();
process.chdir(tmp);

const opsDir = path.join(tmp, 'ops');
fs.mkdirSync(opsDir);
fs.writeFileSync(
  path.join(opsDir, 'rehearsal_eligibility.json'),
  JSON.stringify({
    schema_version: 1,
    entries: [
      {
        project_space_key: 'scenario1_ps_alpha',
        target_sink: 'github',
        class: 'sandbox_safe',
        allowed_live_writers: ['github'],
      },
    ],
  }),
);

// 의도적으로 live_verified sink 가 없는 qualification ledger 를 기록
fs.writeFileSync(
  path.join(opsDir, 'live_binding_capability_qualifications.json'),
  JSON.stringify({
    schema_version: 1,
    sinks: {
      github: {
        qualification_status: 'conservative',
        last_verified_at: null,
      },
    },
  }),
);

const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const prevLive = process.env.COS_SCENARIO_LIVE_OPENAI;
const prevWriters = process.env.COS_LIVE_BINDING_WRITERS;
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.COS_SCENARIO_LIVE_OPENAI = '1';
process.env.COS_LIVE_BINDING_WRITERS = '1';

try {
  const { runScenarioProofLive } = await import('../src/founder/scenarioProofLiveRunner.js');
  const out = await runScenarioProofLive({
    runMode: 'live_openai',
    writeToDisk: false,
  });
  assert.equal(out.runs.length, 2);
  for (const r of out.runs) {
    assert.ok(r.envelope);
    assert.equal(r.envelope.outcome, 'inconclusive', 'inconclusive regardless of rehearsal_eligibility');
    const cls = r.envelope.failure_classification.resolution_class;
    assert.ok(
      cls === 'technical_capability_missing' || cls === 'tenancy_or_binding_ambiguity',
      `must remain capability/tenancy gated, got ${cls}`,
    );
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
  if (prevWriters == null) delete process.env.COS_LIVE_BINDING_WRITERS;
  else process.env.COS_LIVE_BINDING_WRITERS = prevWriters;
}

console.log('test-rehearsal-gate-does-not-weaken-qualification: ok');
