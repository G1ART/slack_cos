#!/usr/bin/env node
/**
 * W10-A regression — proactiveSurfaceDraft → buildFounderConversationInput.proactiveSurfaceLines 파이프.
 *
 * - draft 가 만든 block_lines 가 conversation input 맨 위에 정확히 삽입되고,
 * - 최근 대화 / attachments / 메타 블록 순서는 유지되어야 한다.
 * - compact_lines 가 비면 block 은 안 삽입된다.
 */

import assert from 'node:assert/strict';

import { applyProactiveSurfacePolicy } from '../src/founder/proactiveSurfacePolicy.js';
import { buildProactiveSurfaceDraft } from '../src/founder/proactiveSurfaceDraft.js';
import { buildFounderConversationInput } from '../src/founder/founderConversationInput.js';

const signals = [
  { kind: 'unresolved_escalation', severity: 'blocker', summary_line: '해결되지 않은 에스컬레이션 1건이 남아 있음' },
  { kind: 'missing_binding', severity: 'attention', summary_line: '프로젝트 공간에 필요한 연결이 아직 없음' },
];
const policy = applyProactiveSurfacePolicy({ signals });
const draft = buildProactiveSurfaceDraft({ compact_lines: policy.compact_lines });

assert.equal(draft.empty, false);
assert.ok(draft.block_lines.length >= 2);
assert.ok(draft.block_lines[0].startsWith('[COS 운영 메모'));

const input = buildFounderConversationInput({
  recentTurns: [{ role: 'user', text: '안녕' }],
  userText: '현재 상황 한 줄로',
  attachmentResults: [],
  metadata: { channel: 'C1', user: 'U1', ts: '1', thread_ts: '2' },
  proactiveSurfaceLines: draft.block_lines,
});

assert.ok(input.startsWith('[COS 운영 메모'), 'proactive block goes to the top');
const recentIdx = input.indexOf('[최근 대화]');
const attIdx = input.indexOf('attachments:');
const currentIdx = input.indexOf('[현재 턴]');
assert.ok(recentIdx > 0);
assert.ok(attIdx > recentIdx);
assert.ok(currentIdx > recentIdx);
// block 라인들이 input 에 모두 등장
for (const ln of draft.block_lines) {
  assert.ok(input.includes(ln), `block line missing from input: ${ln}`);
}

// empty draft → block 삽입 금지
const input2 = buildFounderConversationInput({
  recentTurns: [],
  userText: '테스트',
  attachmentResults: [],
  metadata: {},
  proactiveSurfaceLines: [],
});
assert.ok(input2.startsWith('[최근 대화]'), 'no proactive prefix when empty');

console.log('test-proactive-surface-draft-conversation-input-pipe: ok');
