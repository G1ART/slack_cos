#!/usr/bin/env node
/** vNext.13.5 — operational meta short-circuit only with founder_explicit_meta_utility_path */
import assert from 'node:assert/strict';

import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const mockRow = {
  natural_language_reply: 'planner path reply',
  state_delta: {},
  conversation_status: 'exploring',
  proposal_artifact: {},
  approval_artifact: {},
  execution_artifact: {},
  follow_up_questions: [],
  requires_founder_confirmation: false,
};

let llmCalls = 0;
const base = {
  source_type: 'direct_message',
  channel: 'DmetaNarrow',
  user: 'UmN',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: mockRow,
  callText: async () => {
    llmCalls += 1;
    return 'fallback';
  },
  callJSON: async () => {
    llmCalls += 1;
    return {};
  },
};

const out = await runFounderDirectKernel({
  text: '현재 SHA 버전이 뭔지 출력해줘.',
  metadata: { ...base },
  route_label: 'dm_ai_router',
});

/** vNext.13.10: 창업자 표면은 항상 callText(파트너) 1회 — 플래너 JSON은 mock 이면 callJSON 미호출 */
assert.equal(llmCalls, 1);
assert.notEqual(out.surface_type, FounderSurfaceType.RUNTIME_META);
assert.notEqual(out.trace?.founder_operational_meta_short_circuit, true);
assert.equal(out.trace?.founder_conversation_path, true);

console.log('ok: vnext13_5_founder_meta_short_circuit_narrow');
