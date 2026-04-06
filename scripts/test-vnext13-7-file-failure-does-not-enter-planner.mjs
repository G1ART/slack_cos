#!/usr/bin/env node
/**
 * vNext.13.9 — 첨부 전부 실패 + 본문 없음 → short-circuit; 본문 있으면 userText 만 커널에 전달.
 */
import assert from 'node:assert/strict';
import { partitionFileIntakeForFounderTurn } from '../src/features/slackFileIntake.js';
import {
  buildFounderTurnAfterFileIngest,
  buildFounderPlannerInputAfterFileIngest,
} from '../src/features/founderSlackFileTurn.js';

const failOnly = partitionFileIntakeForFounderTurn(
  [{ ok: false, errorCode: 'downloaded_html_instead_of_file', filename: 'a.pdf' }],
  '',
);
assert.equal(failOnly.skipPlannerEntirely, true);
assert.equal(failOnly.outcome, 'failure');

const turn = buildFounderTurnAfterFileIngest(
  [{ ok: false, errorCode: 'mime_ext_mismatch', filename: 'x.png' }],
  '',
);
assert.equal(turn.modelUserText, '');
assert.equal(turn.canShortCircuitFailure, true);
assert.ok(turn.failureNotes.length >= 1);

const legacy = buildFounderPlannerInputAfterFileIngest(
  [{ ok: false, errorCode: 'mime_ext_mismatch', filename: 'x.png' }],
  '',
);
assert.equal(legacy.skipPlanner, false);
assert.equal(legacy.combinedTextForPlanner, '');

const withUser = buildFounderTurnAfterFileIngest(
  [{ ok: false, errorCode: 'unsupported_payload_signature', filename: 'b.bin' }],
  '요약해줘',
);
assert.equal(withUser.modelUserText, '요약해줘');
assert.equal(withUser.canShortCircuitFailure, false);
assert.ok(withUser.failureNotes.length >= 1);
assert.ok(!withUser.modelUserText.includes('첨부'));

console.log('ok: vnext13_7_file_failure_does_not_enter_planner');
