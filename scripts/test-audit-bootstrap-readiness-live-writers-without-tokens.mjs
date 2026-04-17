/**
 * W13-D — COS_LIVE_BINDING_WRITERS=1 인데 provider 토큰이 없으면 fail_missing_prereq.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBootstrapAudit } from './audit-bootstrap-readiness.mjs';

const REPO = path.dirname(fileURLToPath(import.meta.url)) + '/..';

const env = {
  SLACK_BOT_TOKEN: 'x',
  SLACK_SIGNING_SECRET: 'x',
  SLACK_APP_TOKEN: 'x',
  OPENAI_API_KEY: 'x',
  COS_LIVE_BINDING_WRITERS: '1',
  // Intentionally no GITHUB_TOKEN / VERCEL_TOKEN / ...
};
const report = runBootstrapAudit({ repoRoot: REPO, env, partnerModeExplicit: false });
assert.equal(report.verdict, 'fail_missing_prereq', `expected fail_missing_prereq got ${report.verdict}`);
const ghFinding = report.findings.find((f) => f.env_key === 'GITHUB_TOKEN');
const vcFinding = report.findings.find((f) => f.env_key === 'VERCEL_TOKEN');
assert.ok(ghFinding, 'GITHUB_TOKEN must be flagged');
assert.ok(vcFinding, 'VERCEL_TOKEN must be flagged');
assert.equal(ghFinding.check, 'D2');
assert.equal(vcFinding.check, 'D2');
assert.match(ghFinding.message, /COS_LIVE_BINDING_WRITERS=1/);
assert.match(vcFinding.message, /COS_LIVE_BINDING_WRITERS=1/);

console.log('test-audit-bootstrap-readiness-live-writers-without-tokens: ok');
