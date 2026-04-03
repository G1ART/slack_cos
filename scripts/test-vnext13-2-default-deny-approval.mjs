#!/usr/bin/env node
import assert from 'node:assert/strict';
import { formatExternalApprovalPacketLines } from '../src/orchestration/approvalPacketFormatter.js';
import {
  ESCALATION_RETURN_TO_FOUNDER_CONDITIONS,
  FOUNDER_APPROVAL_WORDING,
} from '../src/orchestration/harnessEscalationPolicy.js';
import { buildFounderApprovalPacket } from '../src/founder/founderApprovalPacket.js';
import { EXTERNAL_MUTATION_DENY_STATES, isExternalMutationAuthorized } from '../src/orchestration/approvalGate.js';

const lines = formatExternalApprovalPacketLines({
  systems: ['GitHub'],
  actions: ['test'],
  why_not_cos_only: 'External state must change for this rehearsal.',
});
assert.ok(lines.includes('COS_ONLY'));
assert.ok(lines.includes('external system'));
assert.ok(/rollback|kill/i.test(lines));

assert.ok(ESCALATION_RETURN_TO_FOUNDER_CONDITIONS.includes('deploy_or_prod_mutation_imminent'));
assert.ok(FOUNDER_APPROVAL_WORDING.before_approval.includes('승인'));
assert.ok(!FOUNDER_APPROVAL_WORDING.before_approval.includes('실행하겠습니다'));

const ap = buildFounderApprovalPacket({
  external_execution_tasks: ['Open GitHub PR'],
  approval_reason: 'test',
});
assert.ok(ap.visible_section.includes('승인'));
assert.ok(!ap.visible_section.includes('실행하겠습니다'));

assert.ok(Array.isArray(EXTERNAL_MUTATION_DENY_STATES));
assert.equal(isExternalMutationAuthorized(null), false);
assert.equal(isExternalMutationAuthorized({ external_execution_authorization: {} }), false);
assert.equal(isExternalMutationAuthorized({ external_execution_authorization: { state: 'pending_approval' } }), false);
assert.equal(isExternalMutationAuthorized({ external_execution_authorization: { state: 'draft_only' } }), false);
assert.equal(isExternalMutationAuthorized({ external_execution_authorization: { state: 'authorized' } }), true);

assert.ok(EXTERNAL_MUTATION_DENY_STATES.includes('pending_approval'));
assert.ok(EXTERNAL_MUTATION_DENY_STATES.includes('draft_only'));

console.log('ok: vnext13_2_default_deny_approval');
