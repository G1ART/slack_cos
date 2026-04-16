#!/usr/bin/env node
/**
 * W6-B regression #3 — disagreement roll-up.
 *  - pkt.disagreement_open=true 인 packet 수가 unresolved_disagreements 로 집계된다
 *  - disagreement 가 있어도 리뷰 duty/status 상관 없이 숫자만 정확해야 한다
 *  - boolean 이 아닌 값(문자열 'true', 1)은 무시된다(가짜 집계 금지)
 */

import assert from 'node:assert/strict';

import { buildHarnessWorkcellRuntime } from '../src/founder/harnessWorkcellRuntime.js';

const res = buildHarnessWorkcellRuntime({
  dispatch_id: 'd_disagree',
  personas: ['research', 'pm', 'engineering'],
  packets: [
    {
      packet_id: 'p1', persona: 'research', owner_persona: 'research',
      review_required: false,
      disagreement_open: true,
    },
    {
      packet_id: 'p2', persona: 'pm', owner_persona: 'pm',
      review_required: false,
      disagreement_open: 'true', // 문자열 — 무시되어야 함
    },
    {
      packet_id: 'p3', persona: 'engineering', owner_persona: 'engineering',
      review_required: false,
      disagreement_open: 1, // 숫자 — 무시되어야 함
    },
    {
      packet_id: 'p4', persona: 'engineering', owner_persona: 'engineering',
      review_required: false,
      disagreement_open: true,
    },
  ],
  persona_contract_runtime_snapshot: ['research: analyze'],
});

assert.equal(res.ok, true);
assert.equal(res.workcell_runtime.unresolved_disagreements, 2, 'only true booleans count');

// 정상 케이스: 0 이면 0
const res2 = buildHarnessWorkcellRuntime({
  dispatch_id: 'd_disagree2',
  personas: ['research'],
  packets: [
    {
      packet_id: 'p1', persona: 'research', owner_persona: 'research',
      review_required: false,
    },
  ],
  persona_contract_runtime_snapshot: ['research: analyze'],
});
assert.equal(res2.ok, true);
assert.equal(res2.workcell_runtime.unresolved_disagreements, 0);

console.log('test-harness-proof-fields-disagreement: ok');
