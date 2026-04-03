#!/usr/bin/env node
import assert from 'node:assert/strict';
import { formatExternalApprovalPacketLines } from '../src/orchestration/approvalPacketFormatter.js';
import {
  ESCALATION_RETURN_TO_FOUNDER_CONDITIONS,
  FOUNDER_APPROVAL_WORDING,
} from '../src/orchestration/harnessEscalationPolicy.js';
import { buildFounderApprovalPacket } from '../src/founder/founderApprovalPacket.js';

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

console.log('ok: vnext13_2_approval_escalation_language');
