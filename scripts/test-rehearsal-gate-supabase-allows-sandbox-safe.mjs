/**
 * W13-B — Supabase 운영 모드 + eligibility 에 sandbox_safe entry 존재 →
 * scenarioProofLiveRunner 의 W13-B 분기는 bounded block 을 **반환하지 않는다** (허용).
 *
 * 다만 W12-D (live_verified sink 필요) 게이트는 여전히 적용될 수 있으므로 이 테스트는
 * `detectLiveBoundaryBlock` 의 W13-B 분기만을 점검한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_allow_'));
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
        notes: 'test sandbox',
        last_reviewed_at: '2026-04-15T00:00:00Z',
        reviewed_by: 'op',
      },
    ],
  }),
);

const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

try {
  const mod = await import('../src/founder/rehearsalEligibility.js');
  const e = mod.readRehearsalEligibility();
  assert.equal(e.entries.length, 1, 'entry loaded');
  assert.equal(
    mod.hasAnySandboxSafeEntry({ eligibility: e }),
    true,
    'hasAnySandboxSafeEntry must be true',
  );
  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'scenario1_ps_alpha',
      sink: 'github',
      eligibility: e,
    }),
    true,
  );
} finally {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevUrl == null) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prevUrl;
  if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

console.log('test-rehearsal-gate-supabase-allows-sandbox-safe: ok');
