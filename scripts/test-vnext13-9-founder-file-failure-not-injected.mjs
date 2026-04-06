#!/usr/bin/env node
/** vNext.13.9 — 실패 노트가 planner user_message 에 섞이지 않음 */
import assert from 'node:assert/strict';
import { buildFounderTurnAfterFileIngest } from '../src/features/founderSlackFileTurn.js';
import { planFounderConversationTurn } from '../src/founder/founderConversationPlanner.js';

const userText = '이 이미지 보고 3문장으로 설명해줘';
const turn = buildFounderTurnAfterFileIngest(
  [{ ok: false, errorCode: 'downloaded_html_instead_of_file', filename: 'x.png' }],
  userText,
);

assert.equal(turn.modelUserText, userText);
assert.ok(!turn.modelUserText.includes('첨부 처리'));
assert.ok(!turn.modelUserText.includes('HTML'));
assert.ok(!turn.modelUserText.includes('참고'));
assert.ok(turn.failureNotes.length >= 1);

const plan = await planFounderConversationTurn({
  userText: turn.modelUserText,
  contextJson: JSON.stringify({
    contextFrame: { slack_attachment_failure_notes: turn.failureNotes, recent_file_contexts: [] },
    durable_state: {},
  }),
  mockPlannerRow: {
    natural_language_reply: '요청 확인했습니다.',
    state_delta: {},
    conversation_status: 'exploring',
    proposal_artifact: {},
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
});

const payload = JSON.stringify(plan.sidecar || {});
assert.ok(!payload.includes('첨부 처리 안내'));
assert.ok(!payload.includes('(첨부'));

console.log('ok: vnext13_9_founder_file_failure_not_injected');
