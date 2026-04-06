#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sendFounderResponse } from '../src/core/founderOutbound.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

let threw = false;
try {
  await sendFounderResponse({
    say: async () => {},
    thread_ts: '1.0',
    rendered_text: '테스트\n\n한 줄 요약: 위험',
    surface_type: FounderSurfaceType.PARTNER_NATURAL,
    trace: { route_label: 'test' },
    metadata: {
      founder_route: true,
      founder_surface_source: 'test',
      pipeline_version: 'vNext.13.14.founder_spine',
      egress_caller: 'test_script',
    },
  });
} catch (e) {
  threw = true;
  assert.equal(e.code, 'founder_council_egress_blocked');
}

assert.equal(threw, true, 'expected founder_council_egress_blocked');

console.log('ok: vnext13_14_founder_council_egress_blocked');
