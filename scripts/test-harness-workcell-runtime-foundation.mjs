/**
 * W2-B minimal workcell runtime — builder, formatter, validator (instruction SSOT).
 */
import assert from 'node:assert/strict';
import {
  buildHarnessWorkcellRuntime,
  normalizePacketOwnerPersona,
  formatHarnessWorkcellSummaryLines,
  validateHarnessWorkcellRuntime,
} from '../src/founder/harnessWorkcellRuntime.js';

const snap = ['pm|planner|v1|mode=x'];

const ok = buildHarnessWorkcellRuntime({
  dispatch_id: 'harness_test_1',
  objective: 'obj',
  personas: ['pm', 'engineering'],
  packets: [
    {
      packet_id: 'p1',
      persona: 'pm',
      mission: 'm1',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      packet_status: 'ready',
      review_required: true,
    },
    {
      packet_id: 'p2',
      persona: 'engineering',
      mission: 'm2',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      packet_status: 'ready',
      review_required: false,
    },
  ],
  persona_contract_runtime_snapshot: snap,
});
assert.equal(ok.ok, true);
const wr = ok.workcell_runtime;
assert.ok(wr && wr.workcell_id);
assert.equal(wr.dispatch_id, 'harness_test_1');
assert.equal(wr.packet_count, 2);
assert.ok(Array.isArray(wr.packets) && wr.packets.length === 2);
assert.ok(ok.packets.every((p) => String(p.owner_persona || '').length > 0));
assert.equal(typeof wr.review_checkpoint_count, 'number');
assert.ok(wr.review_checkpoint_count >= 1, 'review_required creates checkpoint count');
assert.equal(typeof wr.escalation_open, 'boolean');
assert.ok(Array.isArray(wr.escalation_targets));
assert.ok(
  ['active', 'review_required', 'rework_requested', 'escalated', 'completed'].includes(String(wr.status)),
);
assert.deepEqual(validateHarnessWorkcellRuntime(wr), { ok: true });

const lines = formatHarnessWorkcellSummaryLines(wr, 8);
assert.ok(lines.length >= 1 && lines.length <= 8);

const badOwner = buildHarnessWorkcellRuntime({
  dispatch_id: 'harness_bad_owner',
  objective: 'o',
  personas: ['pm'],
  packets: [
    {
      packet_id: 'p1',
      persona: '',
      mission: 'm',
      owner_persona: 'not_a_real_persona',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      packet_status: 'ready',
    },
  ],
  persona_contract_runtime_snapshot: snap,
});
assert.equal(badOwner.ok, false);
assert.equal(badOwner.blocked_reason, 'workcell_owner_persona_invalid');

assert.equal(
  normalizePacketOwnerPersona({ persona: 'pm', packet_id: 'x' }, ['pm', 'engineering']),
  'pm',
);

const vBad = validateHarnessWorkcellRuntime({ workcell_id: '', dispatch_id: 'x', status: 'active' });
assert.equal(vBad.ok, false);

console.log('test-harness-workcell-runtime-foundation: ok');
