/**
 * W13-D — package.json 이 참조하는 scripts 가 디스크에 없으면 fail_drift 로 보고된다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runBootstrapAudit } from './audit-bootstrap-readiness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13d_drift_'));
try {
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'fake',
      version: '0.0.0',
      dependencies: {
        'libsodium-wrappers': '^0.7.0',
        '@slack/bolt': '^4.0.0',
        '@supabase/supabase-js': '^2.0.0',
        openai: '^4.0.0',
      },
      scripts: {
        bogus: 'node scripts/does-not-exist-anywhere.mjs',
      },
    }),
  );
  fs.mkdirSync(path.join(tmp, 'supabase', 'migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'supabase', 'migrations', '20260501120000_project_space_binding_graph.sql'),
    '-- ok',
  );
  fs.writeFileSync(
    path.join(tmp, 'supabase', 'migrations', '20260601120000_binding_propagation_and_continuation.sql'),
    '-- ok',
  );
  fs.mkdirSync(path.join(tmp, 'src', 'founder'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'founder', 'liveBindingCapabilityRegistry.js'), '// stub');
  fs.mkdirSync(path.join(tmp, 'docs', 'design-partner-beta'), { recursive: true });
  for (const f of [
    'SLACK_APP_MANIFEST.reference.json',
    'INSTALL_NOTES.md',
    'BYO_KEYS_INFRA_STANCE.md',
    'OPERATOR_SMOKE_TEST_CHECKLIST.md',
    'KNOWN_HUMAN_GATE_POINTS.md',
  ]) fs.writeFileSync(path.join(tmp, 'docs', 'design-partner-beta', f), '# stub');

  const env = {
    SLACK_BOT_TOKEN: 'x',
    SLACK_SIGNING_SECRET: 'x',
    SLACK_APP_TOKEN: 'x',
    OPENAI_API_KEY: 'x',
  };
  const report = runBootstrapAudit({ repoRoot: tmp, env, partnerModeExplicit: false });
  const drift = report.findings.find(
    (f) => f.verdict === 'fail_drift' && f.path === 'scripts/does-not-exist-anywhere.mjs',
  );
  assert.ok(drift, 'must flag missing script as fail_drift');
  assert.equal(drift.check, 'D1');
  assert.equal(
    report.verdict,
    'fail_drift',
    `expected verdict fail_drift when only drift is present, got ${report.verdict}`,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-audit-bootstrap-readiness-script-drift: ok');
