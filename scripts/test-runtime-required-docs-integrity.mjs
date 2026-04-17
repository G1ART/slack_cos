/**
 * W13-C — docs/runtime_required_docs.json 정합 회귀:
 *   - schema_version === 1
 *   - global_required / workstream_required 의 모든 경로는 디스크에 존재
 *   - W13 workstream 키(`w13_bulk_live_surface_rehearsal_bootstrap_quality`)가 등록되어 있고
 *     지시서 문서를 가리킴
 *   - audit-preflight-ack-drift 에서 W13 manifest 는 exception 에 포함되지 않아야 한다 (drift 0).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditRepo } from './audit-preflight-ack-drift.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const rrd = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'runtime_required_docs.json'), 'utf8'));
assert.equal(rrd.schema_version, 1);

for (const p of rrd.global_required || []) {
  assert.ok(fs.existsSync(path.join(REPO, p)), `global_required missing on disk: ${p}`);
}

const w13Key = 'w13_bulk_live_surface_rehearsal_bootstrap_quality';
assert.ok(rrd.workstream_required && rrd.workstream_required[w13Key], 'W13 workstream entry required');
const w13Paths = rrd.workstream_required[w13Key];
assert.ok(Array.isArray(w13Paths) && w13Paths.length >= 1, 'W13 must list at least one doc');
for (const p of w13Paths) {
  assert.ok(fs.existsSync(path.join(REPO, p)), `W13 required doc missing: ${p}`);
}
assert.ok(
  w13Paths.some((p) => p.includes('W13_Bulk_Master_Instruction')),
  'W13 workstream must reference the W13 master instruction doc',
);

for (const key of Object.keys(rrd.workstream_required || {})) {
  for (const p of rrd.workstream_required[key] || []) {
    assert.ok(fs.existsSync(path.join(REPO, p)), `workstream_required[${key}] missing: ${p}`);
  }
}

const exceptionsPath = path.join(REPO, 'ops', 'preflight_ack_drift_exceptions.json');
if (fs.existsSync(exceptionsPath)) {
  const exc = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
  const frozen = new Set((exc.frozen_manifests || []).map((e) => e.manifest));
  assert.ok(
    !frozen.has('w13_bulk_live_surface_rehearsal_bootstrap_quality.json'),
    'W13 manifest must NOT be in frozen exception list',
  );
}

const report = auditRepo(REPO);
const w13Drift = report.findings.filter(
  (f) => f.manifest === 'w13_bulk_live_surface_rehearsal_bootstrap_quality.json' && !f.accepted_historical_drift,
);
assert.equal(w13Drift.length, 0, `W13 manifest must have zero unfrozen drift, found ${w13Drift.length}`);

const unfrozen = report.findings.filter((f) => !f.accepted_historical_drift);
assert.equal(unfrozen.length, 0, `Repo-wide unfrozen drift must be 0 but got ${unfrozen.length}`);

console.log('test-runtime-required-docs-integrity: ok');
