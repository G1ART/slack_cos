/**
 * W13-D — verdict ordering priority (worst wins):
 *   fail_unsafe_mode > fail_missing_prereq > fail_drift > pass_with_manual_gates > pass
 * partner_mode=false + 모든 prereq 충족 → 최소 pass_with_manual_gates (D4 의 manual gate 기록으로 인해).
 * partner_mode=false + live writers off + 종합 상태 정상인 이 저장소는 pass_with_manual_gates 이어야 한다.
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
  // COS_LIVE_BINDING_WRITERS 미설정
  // COS_DESIGN_PARTNER_MODE 미설정
};
const report = runBootstrapAudit({ repoRoot: REPO, env, partnerModeExplicit: false });
assert.ok(
  report.verdict === 'pass' || report.verdict === 'pass_with_manual_gates',
  `expected pass or pass_with_manual_gates, got ${report.verdict}`,
);
// KNOWN_HUMAN_GATE_POINTS 가 존재하므로 D4 에서 pass_with_manual_gates 는 반드시 포함된다.
const hasManualGatesFinding = report.findings.some(
  (f) => f.check === 'D4' && f.verdict === 'pass_with_manual_gates',
);
assert.ok(hasManualGatesFinding, 'D4 must record pass_with_manual_gates');

// Verdict ordering sanity — confirm a fail_unsafe_mode wins over any combination.
const envUnsafe = {
  ...env,
  COS_DESIGN_PARTNER_MODE: '1',
  COS_RUN_STORE: 'memory',
  COS_LIVE_BINDING_WRITERS: '1',
};
const reportUnsafe = runBootstrapAudit({
  repoRoot: REPO,
  env: envUnsafe,
  partnerModeExplicit: true,
});
assert.equal(reportUnsafe.verdict, 'fail_unsafe_mode', 'unsafe mode must dominate');

console.log('test-audit-bootstrap-readiness-verdict-ordering: ok');
