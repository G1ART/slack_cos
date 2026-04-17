/**
 * W13-D — bootstrap audit 는 libsodium-wrappers 같은 live surface 필수 패키지 부재를 잡는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runBootstrapAudit } from './audit-bootstrap-readiness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13d_missing_dep_'));
try {
  // Minimal repo with package.json missing libsodium-wrappers
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'fake',
      version: '0.0.0',
      dependencies: { '@slack/bolt': '^4.0.0', '@supabase/supabase-js': '^2.0.0', openai: '^4.0.0' },
      scripts: {},
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
  assert.equal(report.verdict, 'fail_missing_prereq', `expected fail_missing_prereq got ${report.verdict}`);
  const libsodium = report.findings.find((f) => f.dependency === 'libsodium-wrappers');
  assert.ok(libsodium, 'libsodium-wrappers dependency finding required');
  assert.equal(libsodium.verdict, 'fail_missing_prereq');
  assert.equal(libsodium.check, 'D1');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-audit-bootstrap-readiness-missing-dependency: ok');
