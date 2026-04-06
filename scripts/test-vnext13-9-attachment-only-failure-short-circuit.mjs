#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildFounderTurnAfterFileIngest, formatFounderFileFailureOnlyMessage } from '../src/features/founderSlackFileTurn.js';

const turn = buildFounderTurnAfterFileIngest(
  [{ ok: false, errorCode: 'fetch_failed', filename: 'doc.pdf' }],
  '',
);
assert.equal(turn.canShortCircuitFailure, true);
assert.equal(turn.modelUserText, '');
const msg = formatFounderFileFailureOnlyMessage(turn.failureNotes);
assert.ok(msg.length > 0);
const bad = ['strategy_finance', 'risk_review', '페르소나별 핵심 관점', '핵심 리스크', '[COS 제안 패킷]', '내부 처리 정보'];
for (const b of bad) {
  assert.ok(!msg.includes(b), `unexpected council/packet leak: ${b}`);
}

console.log('ok: vnext13_9_attachment_only_failure_short_circuit');
