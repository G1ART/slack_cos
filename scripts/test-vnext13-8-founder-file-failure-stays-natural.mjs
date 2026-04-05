#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildFounderTurnTextAfterFileIngest } from '../src/features/founderSlackFileTurn.js';

const r = buildFounderTurnTextAfterFileIngest(
  [{ ok: false, errorCode: 'oversized', filename: 'huge.pdf' }],
  '이 파일 왜 안 열려?',
);
assert.ok(r.combinedTextForPlanner.includes('이 파일 왜 안 열려?'));
assert.ok(r.combinedTextForPlanner.includes('첨부 처리 안내') || r.combinedTextForPlanner.includes('참고'));

console.log('ok: vnext13_8_founder_file_failure_stays_natural');
