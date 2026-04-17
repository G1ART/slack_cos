/**
 * W13-B — filterWritersByRehearsalAllowlist 는 allowed_live_writers 에 포함되지 않은 sink 를 제거한다.
 * sandbox_safe entry 가 아예 없을 때는 빈 객체 반환(fail-closed).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_filter_'));
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

  const writers = {
    github: { write: async () => ({}) },
    vercel: { write: async () => ({}) },
    railway: { write: async () => ({}) },
  };

  const filtered = mod.filterWritersByRehearsalAllowlist(writers, {
    project_space_key: 'psAlpha',
    eligibility: e,
  });
  assert.deepEqual(Object.keys(filtered).sort(), ['github']);

  // psBeta 는 sandbox_safe entry 가 없으므로 모두 제거(fail-closed).
  const filteredBeta = mod.filterWritersByRehearsalAllowlist(writers, {
    project_space_key: 'psBeta',
    eligibility: e,
  });
  assert.deepEqual(Object.keys(filteredBeta), []);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-rehearsal-gate-writer-allowlist-filters-sinks: ok');
