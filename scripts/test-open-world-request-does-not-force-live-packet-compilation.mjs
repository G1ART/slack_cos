/**
 * vNext.13.45 — Envelope/starter emit_patch without closed live_patch does not narrow-compile.
 */
import assert from 'node:assert';
import { prepareEmitPatchForCloudAutomation } from '../src/founder/livePatchPayload.js';
import { buildInvokePayloadForPacket } from '../src/founder/starterLadder.js';

const pkt = {
  packet_id: 'p_open',
  persona: 'engineering',
  mission: 'broad unclear refactor of many modules',
  deliverables: ['better code'],
  definition_of_done: ['better code'],
  handoff_to: '',
  artifact_format: 'spec_markdown',
  preferred_tool: 'cursor',
  preferred_action: 'emit_patch',
  review_required: false,
  review_focus: [],
  packet_status: 'ready',
};

const pl = buildInvokePayloadForPacket(pkt);
assert.ok(pl && typeof pl.live_patch !== 'object', 'starter payload must not invent live_patch');
const prep = prepareEmitPatchForCloudAutomation(pl);
assert.equal(prep.compilation, 'none');
assert.equal(prep.cloud_ok, false);

console.log('test-open-world-request-does-not-force-live-packet-compilation: ok');
