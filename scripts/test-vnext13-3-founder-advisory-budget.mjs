#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  maybeGovernanceAdvisoryForFounder,
  GOVERNANCE_ADVISORY_MAX_CHARS,
  GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE,
  isGovernanceAdvisorySurfaceForbidden,
} from '../src/orchestration/cosGovernanceAdvisory.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const prev = process.env.COS_GOVERNANCE_ADVISORY;
process.env.COS_GOVERNANCE_ADVISORY = '0';
assert.equal(
  maybeGovernanceAdvisoryForFounder({
    rawText: '투자자별 아웃리치 자동화 지금 구조로 충분한가?',
    contextFrame: {},
    founderSurface: GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE,
  }),
  null,
);

process.env.COS_GOVERNANCE_ADVISORY = '1';
assert.equal(
  maybeGovernanceAdvisoryForFounder({
    rawText: '투자자별 아웃리치 자동화 지금 구조로 충분한가?',
    contextFrame: {},
    founderSurface: FounderSurfaceType.PROPOSAL_PACKET,
  }),
  null,
);

const g = maybeGovernanceAdvisoryForFounder({
  rawText: '투자자별 아웃리치 자동화 지금 구조로 충분한가?',
  contextFrame: {},
  founderSurface: GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE,
});
assert.ok(g?.text);
assert.ok(g.text.length <= GOVERNANCE_ADVISORY_MAX_CHARS);
assert.ok(isGovernanceAdvisorySurfaceForbidden(FounderSurfaceType.APPROVAL_PACKET));
assert.ok(!isGovernanceAdvisorySurfaceForbidden(GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE));

process.env.COS_GOVERNANCE_ADVISORY = prev;

console.log('ok: vnext13_3_founder_advisory_budget');
