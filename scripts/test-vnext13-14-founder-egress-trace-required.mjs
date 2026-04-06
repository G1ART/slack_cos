#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sendFounderResponse } from '../src/core/founderOutbound.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

for (const badMeta of [
  { founder_route: true, founder_surface_source: 'x', egress_caller: 't' },
  { founder_route: true, founder_surface_source: '', pipeline_version: 'v', egress_caller: 't' },
  { founder_route: true, founder_surface_source: 'x', pipeline_version: 'v', egress_caller: '' },
]) {
  let threw = false;
  try {
    await sendFounderResponse({
      say: async () => {},
      thread_ts: '1.0',
      rendered_text: '안전한 짧은 답',
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      trace: { route_label: 'test' },
      metadata: badMeta,
    });
  } catch (e) {
    threw = true;
    assert.ok(String(e.code || e.message).includes('founder_egress_contract'), e.message);
  }
  assert.equal(threw, true, `expected contract throw for ${JSON.stringify(badMeta)}`);
}

console.log('ok: vnext13_14_founder_egress_trace_required');
