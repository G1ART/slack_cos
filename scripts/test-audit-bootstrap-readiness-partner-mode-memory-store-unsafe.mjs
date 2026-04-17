/**
 * W13-D — partner_mode + COS_RUN_STORE=memory 는 fail_unsafe_mode.
 * app.js 의 boot guard 도 같은 원리로 동작하지만 여기서는 audit 의 분류를 검증한다.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBootstrapAudit } from './audit-bootstrap-readiness.mjs';

const REPO = path.dirname(fileURLToPath(import.meta.url)) + '/..';

const envUnsafe = {
  SLACK_BOT_TOKEN: 'x',
  SLACK_SIGNING_SECRET: 'x',
  SLACK_APP_TOKEN: 'x',
  OPENAI_API_KEY: 'x',
  COS_DESIGN_PARTNER_MODE: '1',
  COS_RUN_STORE: 'memory',
};
const report = runBootstrapAudit({ repoRoot: REPO, env: envUnsafe, partnerModeExplicit: true });
assert.equal(report.verdict, 'fail_unsafe_mode', `expected fail_unsafe_mode got ${report.verdict}`);
const unsafe = report.findings.find((f) => f.verdict === 'fail_unsafe_mode' && f.check === 'D3');
assert.ok(unsafe, 'must surface fail_unsafe_mode finding in D3');
assert.match(unsafe.message, /unsafe/i);

console.log('test-audit-bootstrap-readiness-partner-mode-memory-store-unsafe: ok');
