/**
 * W13-B — rehearsalEligibility.js 가 로컬 ops/rehearsal_eligibility.json 을 SSOT 로 읽고,
 *         파일이 없을 때는 production 으로 fail-closed 취급하는지 검증.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const mod = await import('../src/founder/rehearsalEligibility.js');

// (1) 파일 없으면 entries=[] + production fail-closed
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_elig_'));
  const missing = path.join(tmp, 'does_not_exist.json');
  const e = mod.readRehearsalEligibility({ filePath: missing });
  assert.equal(e.entries.length, 0);
  assert.equal(e.loaded_from, null);
  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'psX',
      sink: 'github',
      eligibility: e,
    }),
    false,
  );
  assert.equal(
    mod.isProductionTarget({ project_space_key: 'psX', sink: 'github', eligibility: e }),
    true,
    'missing entry → production fail-closed',
  );
  fs.rmSync(tmp, { recursive: true, force: true });
}

// (2) 파일이 있으면 entries 로딩 + sandbox_safe 는 허용
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_elig_'));
  const file = path.join(tmp, 'rehearsal_eligibility.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      entries: [
        {
          project_space_key: 'psAlpha',
          target_sink: 'github',
          class: 'sandbox_safe',
          allowed_live_writers: ['github'],
          notes: 'alpha sandbox',
          last_reviewed_at: '2026-04-15T00:00:00Z',
          reviewed_by: 'op1',
        },
        {
          project_space_key: 'psAlpha',
          target_sink: 'vercel',
          class: 'staging',
          allowed_live_writers: [],
        },
      ],
    }),
  );
  const e = mod.readRehearsalEligibility({ filePath: file });
  assert.equal(e.entries.length, 2);
  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'psAlpha',
      sink: 'github',
      eligibility: e,
    }),
    true,
    'sandbox_safe + in allowlist',
  );
  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'psAlpha',
      sink: 'vercel',
      eligibility: e,
    }),
    false,
    'staging → not sandbox_safe',
  );
  assert.deepEqual(mod.listAllowedWritersForSandbox({ project_space_key: 'psAlpha', eligibility: e }), [
    'github',
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// (3) 잘못된 class 는 무시
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_elig_'));
  const file = path.join(tmp, 'rehearsal_eligibility.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      entries: [
        { project_space_key: 'p', target_sink: 'github', class: 'garbage', allowed_live_writers: [] },
      ],
    }),
  );
  const e = mod.readRehearsalEligibility({ filePath: file });
  assert.equal(e.entries.length, 0, 'invalid class dropped');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-rehearsal-eligibility-file-is-ssot: ok');
