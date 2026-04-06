#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveFounderRouteDecision } from '../src/founder/founderRouteInvariant.js';
import { classifyFounderRoutingLock } from '../src/features/inboundFounderRoutingLock.js';
import { normalizeSlackUserPayload } from '../src/slack/slackTextNormalize.js';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const meta = {
  source_type: 'direct_message',
  channel: 'Dtest99',
  user: 'U1',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
};
const inputNorm = normalizeSlackUserPayload('지금 SHA 뭐야?');
const founderRoute = resolveFounderRouteDecision(meta).founder_route;
const lock = classifyFounderRoutingLock(inputNorm);
assert.equal(founderRoute, true);
assert.equal(lock?.kind, 'version');
const wouldOldShortcut = lock?.kind === 'version' && !founderRoute;
assert.equal(wouldOldShortcut, false);

const out = await runFounderDirectKernel({
  text: '지금 SHA 뭐야?',
  metadata: {
    ...meta,
    callText: async () => '테스트용 자연어 응답입니다.',
    callJSON: null,
  },
  route_label: 'dm_ai_router',
});
assert.equal(out.surface_type, FounderSurfaceType.PARTNER_NATURAL);
assert.ok(!String(out.trace?.response_type || '').includes('runtime_meta'));

console.log('ok: vnext13_9_version_no_implicit_shortcut_founder');
