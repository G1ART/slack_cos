#!/usr/bin/env node
import assert from 'node:assert/strict';
import { maybeGovernanceAdvisoryForFounder } from '../src/orchestration/cosGovernanceAdvisory.js';

const ko =
  '이제 투자자별 맞춤 아웃리치까지 자동화하고 싶은데, 지금 구조로 충분한가?';
const g = maybeGovernanceAdvisoryForFounder({
  rawText: ko,
  contextFrame: {},
});
assert.ok(g, 'advisory for sufficiency + outreach');
assert.ok(g.text.includes('COS 운영 조언'));
assert.ok(g.topics.includes('re_org') || g.topics.includes('tooling'));

const noise = maybeGovernanceAdvisoryForFounder({ rawText: '오늘 날씨 좋네요', contextFrame: {} });
assert.equal(noise, null);

console.log('ok: vnext13_2_cos_governance_advisory');
