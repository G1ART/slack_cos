#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildProposalFromFounderInput } from '../src/founder/founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from '../src/founder/executionModeFromProposalPacket.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';

function ctx(channel) {
  const m = { source_type: 'direct_message', channel, user: 'Us', ts: '1' };
  return synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m });
}

const irLine =
  'IR deck narrative rewrite. US VC strategic art-sector investors tone split.';
const e1 = buildProposalFromFounderInput({
  rawText: irLine,
  contextFrame: ctx('De2e1'),
});
assert.equal(selectExecutionModeFromProposalPacket(e1), 'COS_ONLY');
assert.equal((e1.external_execution_tasks || []).length, 0);

const e2 = buildProposalFromFounderInput({
  rawText: 'Five competitors benchmark differentiation strategy memo.',
  contextFrame: ctx('De2e2'),
});
assert.equal(selectExecutionModeFromProposalPacket(e2), 'INTERNAL_SUPPORT');
assert.equal((e2.external_execution_tasks || []).length, 0);

const bud =
  'Quarter budget three scenarios aggressive neutral conservative.';
const e3 = buildProposalFromFounderInput({
  rawText: bud,
  contextFrame: ctx('De2e3'),
});
assert.ok(['COS_ONLY', 'INTERNAL_SUPPORT'].includes(selectExecutionModeFromProposalPacket(e3)));
assert.equal((e3.external_execution_tasks || []).length, 0);

const base = ctx('De2e4');
const framed = buildProposalFromFounderInput({
  rawText: 'Budget short',
  contextFrame: {
    ...base,
    goal_line_hint: 'Series A deck prep',
    constraints: ['no prod deploy before approval'],
  },
});
assert.ok(String(framed.understood_request || '').includes('Series A'));
assert.ok((framed.context_assumptions || []).some((l) => String(l).includes('직전 합의')));

const ambiguous = buildProposalFromFounderInput({
  rawText: 'Deck and budget together please',
  contextFrame: ctx('De2e5'),
});
assert.ok((ambiguous.open_questions || []).length >= 1);

console.log('ok: vnext13_2_proposal_softening');
