#!/usr/bin/env node
import assert from 'node:assert/strict';
import { partitionFileIntakeForFounderTurn } from '../src/features/slackFileIntake.js';
import { buildFounderPlannerInputAfterFileIngest } from '../src/features/founderSlackFileTurn.js';

const failOnly = partitionFileIntakeForFounderTurn(
  [{ ok: false, errorCode: 'downloaded_html_instead_of_file', filename: 'a.pdf' }],
  '',
);
assert.equal(failOnly.skipPlannerEntirely, true);
assert.equal(failOnly.outcome, 'failure');

const planner = buildFounderPlannerInputAfterFileIngest(
  [{ ok: false, errorCode: 'mime_ext_mismatch', filename: 'x.png' }],
  '',
);
assert.equal(planner.skipPlanner, true);
assert.equal(planner.combinedTextForPlanner, '');

const withUser = buildFounderPlannerInputAfterFileIngest(
  [{ ok: false, errorCode: 'unsupported_payload_signature', filename: 'b.bin' }],
  '요약해줘',
);
assert.equal(withUser.skipPlanner, false);
assert.equal(withUser.combinedTextForPlanner.trim(), '요약해줘');
assert.ok(withUser.failureNotes.length >= 1);

console.log('ok: vnext13_7_file_failure_does_not_enter_planner');
