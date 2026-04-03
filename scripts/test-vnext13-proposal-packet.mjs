#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildProposalFromFounderInput } from '../src/founder/founderProposalKernel.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { emptyProposalPacket, formatProposalPacketForSlack } from '../src/founder/founderProposalPacket.js';

const m = { source_type: 'direct_message', channel: 'Dpp', user: 'Upp', ts: '1.0' };
const threadKey = buildSlackThreadKey(m);
const ctx = synthesizeFounderContext({ threadKey, metadata: m });

const p = buildProposalFromFounderInput({
  rawText: 'Quarter budget scenarios and runway assumptions as a table',
  contextFrame: ctx,
});
const shape = emptyProposalPacket();
for (const k of Object.keys(shape)) {
  assert.ok(k in p, 'proposal has field ' + k);
}
assert.ok(String(p.understood_request || '').length > 0);
assert.ok(Array.isArray(p.cos_only_tasks));
assert.ok(Array.isArray(p.proposed_roadmap));
assert.ok(p.approval_options && p.approval_options.length >= 2);

const slack = formatProposalPacketForSlack(p);
assert.ok(slack.includes('[COS 제안 패킷]'));

console.log('ok: vnext13_proposal_packet');
