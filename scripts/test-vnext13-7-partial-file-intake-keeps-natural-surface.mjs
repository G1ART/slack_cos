#!/usr/bin/env node
import assert from 'node:assert/strict';
import { partitionFileIntakeForFounderTurn, buildConciseFileContextForPlanner } from '../src/features/slackFileIntake.js';
import { buildFounderPlannerInputAfterFileIngest } from '../src/features/founderSlackFileTurn.js';

const results = [
  { ok: true, filename: 'ok.txt', summary: 'hello world', text: 'hello world' },
  { ok: false, errorCode: 'pdf_no_text_layer', filename: 'bad.pdf' },
];
const part = partitionFileIntakeForFounderTurn(results, '둘 다 봐줘');
assert.equal(part.outcome, 'partial_success');
assert.equal(part.skipPlannerEntirely, false);

const planner = buildFounderPlannerInputAfterFileIngest(results, '둘 다 봐줘');
assert.ok(planner.combinedTextForPlanner.includes('둘 다 봐줘'));
assert.ok(planner.combinedTextForPlanner.includes('첨부 요약'));
assert.equal(planner.skipPlanner, false);
assert.ok(planner.failureNotes.length >= 1);

const concise = buildConciseFileContextForPlanner([results[0]]);
assert.ok(concise.includes('hello'));

console.log('ok: vnext13_7_partial_file_intake_keeps_natural_surface');
