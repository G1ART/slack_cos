#!/usr/bin/env node
/**
 * vNext.13.7 → 13.8: 파일 실패도 **동일** founder 입력 조립으로 이어짐 (별도 라우팅 조기 종료 없음).
 */
import assert from 'node:assert/strict';
import { partitionFileIntakeForFounderTurn } from '../src/features/slackFileIntake.js';
import {
  buildFounderTurnTextAfterFileIngest,
  buildFounderPlannerInputAfterFileIngest,
} from '../src/features/founderSlackFileTurn.js';

const failOnly = partitionFileIntakeForFounderTurn(
  [{ ok: false, errorCode: 'downloaded_html_instead_of_file', filename: 'a.pdf' }],
  '',
);
assert.equal(failOnly.skipPlannerEntirely, true);
assert.equal(failOnly.outcome, 'failure');

const turn = buildFounderTurnTextAfterFileIngest(
  [{ ok: false, errorCode: 'mime_ext_mismatch', filename: 'x.png' }],
  '',
);
assert.ok(turn.combinedTextForPlanner.length > 0, 'failure-only still yields kernel input');
assert.ok(turn.combinedTextForPlanner.includes('첨부') || turn.combinedTextForPlanner.includes('전송'));
assert.ok(turn.failureNotes.length >= 1);

const legacy = buildFounderPlannerInputAfterFileIngest(
  [{ ok: false, errorCode: 'mime_ext_mismatch', filename: 'x.png' }],
  '',
);
assert.equal(legacy.skipPlanner, false);

const withUser = buildFounderTurnTextAfterFileIngest(
  [{ ok: false, errorCode: 'unsupported_payload_signature', filename: 'b.bin' }],
  '요약해줘',
);
assert.ok(withUser.combinedTextForPlanner.trim().startsWith('요약해줘'));
assert.ok(withUser.failureNotes.length >= 1);

console.log('ok: vnext13_7_file_failure_does_not_enter_planner');
