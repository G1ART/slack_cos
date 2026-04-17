/**
 * W13-C — audit-preflight-ack-drift 회귀:
 *   1) stale sha 가 있는 manifest 는 stale_chunk 로 보고된다.
 *   2) missing ack 는 missing_ack 로 보고된다.
 *   3) exceptions file 에 등록된 manifest 의 findings 는 accepted_historical_drift:true 로 annotate 되고
 *      strict 모드에서는 report.ok=true 가 된다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { auditRepo } from './audit-preflight-ack-drift.mjs';

function sha(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13c_audit_'));
try {
  const manifestDir = path.join(tmp, 'ops', 'preflight_manifest');
  const ackDir = path.join(tmp, 'ops', 'preflight_ack');
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.mkdirSync(ackDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const docPath = path.join(docsDir, 'A.md');
  const docBody = 'line1\nline2\nline3';
  fs.writeFileSync(docPath, docBody);

  const liveSha = sha(docBody);
  const bogusSha = 'ff'.repeat(32);

  // Manifest with WRONG sha → stale_chunk expected
  fs.writeFileSync(
    path.join(manifestDir, 'stale_task.json'),
    JSON.stringify({
      schema_version: 1,
      task_id: 'stale_task',
      chunk_line_size: 10,
      chunks: [{ path: 'docs/A.md', start_line: 1, end_line: 3, sha256: bogusSha }],
    }),
  );
  fs.writeFileSync(
    path.join(ackDir, 'stale_task.json'),
    JSON.stringify({
      schema_version: 1,
      task_id: 'stale_task',
      chunks: [
        {
          path: 'docs/A.md',
          start_line: 1,
          end_line: 3,
          sha256: bogusSha,
          acknowledged: true,
          summary: 'ack note (dummy) with enough length to pass check',
        },
      ],
    }),
  );

  // Manifest without paired ack → missing_ack expected
  fs.writeFileSync(
    path.join(manifestDir, 'no_ack_task.json'),
    JSON.stringify({
      schema_version: 1,
      task_id: 'no_ack_task',
      chunks: [{ path: 'docs/A.md', start_line: 1, end_line: 3, sha256: liveSha }],
    }),
  );

  // runtime_required_docs minimal valid
  fs.writeFileSync(
    path.join(tmp, 'docs', 'runtime_required_docs.json'),
    JSON.stringify({
      schema_version: 1,
      global_required: ['docs/A.md'],
      workstream_required: {},
    }),
  );

  // Audit without exceptions
  const report1 = auditRepo(tmp);
  assert.equal(report1.ok, false, 'should have findings without exceptions');
  const kinds = new Set(report1.findings.map((f) => f.kind));
  assert.ok(kinds.has('stale_chunk'), 'stale_chunk must be reported');
  assert.ok(kinds.has('missing_ack'), 'missing_ack must be reported');
  for (const f of report1.findings) {
    assert.notEqual(f.accepted_historical_drift, true, 'no exception without file');
  }

  // Now write exceptions file freezing both manifests
  const exceptionsPath = path.join(tmp, 'ops', 'preflight_ack_drift_exceptions.json');
  fs.writeFileSync(
    exceptionsPath,
    JSON.stringify({
      schema_version: 1,
      frozen_manifests: [
        { manifest: 'stale_task.json', reason: 'test fixture' },
        { manifest: 'no_ack_task.json', reason: 'test fixture' },
      ],
    }),
  );
  const report2 = auditRepo(tmp);
  assert.equal(report2.frozen_manifest_count, 2);
  assert.equal(report2.ok, true, 'exceptions should neutralize ok verdict');
  for (const f of report2.findings) {
    assert.equal(f.accepted_historical_drift, true, 'each finding must be annotated as historical');
  }

  // If exceptions file is explicitly elsewhere non-existent → still not-ok
  const report3 = auditRepo(tmp, { exceptionsPath: '/tmp/does-not-exist-w13c.json' });
  assert.equal(report3.ok, false, 'non-existent exceptions file → no annotation');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-audit-preflight-ack-drift-detects-stale-manifest: ok');
