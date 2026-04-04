#!/usr/bin/env node
/** vNext.13.4 — SHA/Cursor/Supabase 운영 메타는 대화 플래너 경로 밖에서 처리 */
import assert from 'node:assert/strict';

import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

let llm = 0;
const base = {
  source_type: 'direct_message',
  channel: 'Drmeta',
  user: 'Ur',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  callText: async () => {
    llm += 1;
    return 'no';
  },
  callJSON: async () => {
    llm += 1;
    return {};
  },
};

const sha = await runFounderDirectKernel({
  text: '현재 SHA 버전이 뭔지 출력해줘.',
  metadata: { ...base },
  route_label: 'dm_ai_router',
});
assert.equal(llm, 0);
assert.equal(sha.surface_type, FounderSurfaceType.RUNTIME_META);
assert.equal(sha.trace.founder_conversation_path, false);
assert.equal(sha.trace.founder_operational_meta_short_circuit, true);
assert.equal(sha.trace.founder_deterministic_utility, 'runtime_stamp');

const cur = await runFounderDirectKernel({
  text: 'Cursor 상태는 어때?',
  metadata: { ...base, ts: '2.0' },
  route_label: 'dm_ai_router',
});
assert.equal(cur.trace.founder_deterministic_utility, 'provider_cursor');

console.log('ok: vnext13_4_founder_runtime_meta_outside_conversation_path');
