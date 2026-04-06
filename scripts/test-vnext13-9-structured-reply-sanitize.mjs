#!/usr/bin/env node
import assert from 'node:assert/strict';
import { planFounderConversationTurn } from '../src/founder/founderConversationPlanner.js';

const dirty =
  '페르소나별 핵심 관점\n- 전략\nstrategy_finance: 할일\n핵심 리스크: 큼\n짧게 답합니다.';

const plan = await planFounderConversationTurn({
  userText: '테스트',
  contextJson: '{}',
  mockPlannerRow: {
    natural_language_reply: dirty,
    state_delta: {},
    conversation_status: 'exploring',
    proposal_artifact: {},
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
});

const reply = String(plan.sidecar?.natural_language_reply || '');
assert.ok(!reply.includes('페르소나별 핵심 관점'));
assert.ok(!reply.includes('strategy_finance'));
assert.ok(!reply.includes('핵심 리스크'));
assert.equal(plan.structured_output_sanitized, true);

console.log('ok: vnext13_9_structured_reply_sanitize');
