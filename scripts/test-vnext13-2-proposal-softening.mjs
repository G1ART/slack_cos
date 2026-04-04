#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildProposalFromFounderInput,
  buildProposalPacketFromSidecar,
} from '../src/founder/founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from '../src/founder/executionModeFromProposalPacket.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { emptySidecarFromPartner } from '../src/founder/founderArtifactSchemas.js';

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

function sidecarWith(pa, aa = {}) {
  const s = emptySidecarFromPartner('');
  s.conversation_status = 'narrowing';
  s.proposal_artifact = pa;
  s.approval_artifact = aa;
  return s;
}

const e2 = buildProposalPacketFromSidecar(
  sidecarWith({
    internal_support_tasks: ['벤치마크 메모'],
    understood_request: 'Five competitors benchmark differentiation strategy memo.',
  }),
  ctx('De2e2'),
  'Five competitors benchmark differentiation strategy memo.',
  { source: 'test' },
);
assert.equal(selectExecutionModeFromProposalPacket(e2), 'INTERNAL_SUPPORT');
assert.equal((e2.external_execution_tasks || []).length, 0);

const bud =
  'Quarter budget three scenarios aggressive neutral conservative.';
const e3 = buildProposalPacketFromSidecar(
  sidecarWith({
    cos_only_tasks: ['예산 시나리오 정렬'],
    understood_request: bud,
  }),
  ctx('De2e3'),
  bud,
  { source: 'test' },
);
assert.ok(['COS_ONLY', 'INTERNAL_SUPPORT'].includes(selectExecutionModeFromProposalPacket(e3)));
assert.equal((e3.external_execution_tasks || []).length, 0);

const base = ctx('De2e4');
const framed = buildProposalPacketFromSidecar(
  sidecarWith({
    understood_request: 'Series A deck prep 맥락에서 Budget short',
  }),
  {
    ...base,
    goal_line_hint: 'Series A deck prep',
    constraints: ['no prod deploy before approval'],
  },
  'Budget short',
  { source: 'test' },
);
assert.ok(String(framed.understood_request || '').includes('Series A'));
assert.ok((framed.context_assumptions || []).some((l) => String(l).includes('직전 합의')));

const ambiguous = buildProposalPacketFromSidecar(
  {
    ...emptySidecarFromPartner(''),
    conversation_status: 'narrowing',
    proposal_artifact: { understood_request: 'Deck and budget' },
    follow_up_questions: ['덱과 예산 중 이번 턴 우선은 무엇인가요?'],
  },
  ctx('De2e5'),
  'Deck and budget together please',
  { source: 'test' },
);
assert.ok((ambiguous.open_questions || []).length >= 1);

console.log('ok: vnext13_2_proposal_softening');
