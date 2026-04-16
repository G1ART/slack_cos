#!/usr/bin/env node
/**
 * W10-B regression — audit-harness-proof CLI fixture 경로.
 * --fixture 를 주면 Supabase 없이도 scorecard 를 출력해야 한다.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-proof-cli-'));
const fix = path.join(tmp, 'sessions.json');
fs.writeFileSync(
  fix,
  JSON.stringify([
    {
      reviewer_findings_count: 1,
      rework_cause_code: 'reviewer_finding',
      acceptance_evidence_kind: 'test_pass',
      unresolved_disagreements: 0,
      correction_hit_rate: 0.9,
      patch_quality_delta: 0.05,
    },
    {
      reviewer_findings_count: 0,
      rework_cause_code: null,
      acceptance_evidence_kind: 'reviewer_sign_off',
      unresolved_disagreements: 0,
      correction_hit_rate: 1,
      patch_quality_delta: 0.1,
    },
  ]),
);

const res = spawnSync(
  process.execPath,
  ['scripts/audit-harness-proof.mjs', '--fixture', fix, '--json'],
  { encoding: 'utf8' },
);
assert.equal(res.status, 0, `cli exit 0, stderr=${res.stderr}`);
const parsed = JSON.parse(res.stdout);
assert.equal(parsed.source, 'fixture');
assert.equal(parsed.scorecard.session_count, 2);
assert.equal(parsed.scorecard.reviewer_findings_total, 1);
assert.ok(Array.isArray(parsed.compact_lines));
assert.ok(parsed.compact_lines.length >= 1);

// text 모드
const res2 = spawnSync(
  process.execPath,
  ['scripts/audit-harness-proof.mjs', '--fixture', fix],
  { encoding: 'utf8' },
);
assert.equal(res2.status, 0);
assert.ok(res2.stdout.includes('source=fixture'));
assert.ok(res2.stdout.includes('sessions=2'));

console.log('test-audit-harness-proof-cli-fixture: ok');
