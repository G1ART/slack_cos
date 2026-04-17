/**
 * W13-B — 다른 project_space_key 로 sandbox_safe 가 등록되어 있어도
 * 현재 project_space_key 로 rehearsal safe 판단에 영향을 주면 안 된다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_cross_'));
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
      },
    ],
  }),
);

try {
  const mod = await import('../src/founder/rehearsalEligibility.js');
  const e = mod.readRehearsalEligibility({ filePath: file });

  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'psAlpha',
      sink: 'github',
      eligibility: e,
    }),
    true,
  );
  assert.equal(
    mod.isRehearsalSafeForProjectSpaceAndSink({
      project_space_key: 'psBeta',
      sink: 'github',
      eligibility: e,
    }),
    false,
    'psBeta must NOT inherit psAlpha eligibility',
  );
  assert.deepEqual(mod.listAllowedWritersForSandbox({ project_space_key: 'psBeta', eligibility: e }), []);
  assert.equal(
    mod.hasAnySandboxSafeEntry({ project_space_key: 'psBeta', eligibility: e }),
    false,
    'scoped hasAnySandboxSafeEntry must be false for psBeta',
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-rehearsal-gate-does-not-cross-project-space: ok');
