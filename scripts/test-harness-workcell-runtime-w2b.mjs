/**
 * W2-B: harness workcell runtime builder (ownership, checkpoints, block paths).
 */
import assert from 'node:assert/strict';
import {
  buildHarnessWorkcellRuntime,
  normalizePacketOwnerPersona,
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
assert.ok(ok.workcell_runtime && ok.workcell_runtime.workcell_id);
assert.equal(ok.workcell_runtime.dispatch_id, 'harness_test_1');
assert.equal(ok.workcell_runtime.packet_count, 2);
assert.ok(Array.isArray(ok.workcell_runtime.packet_owners) && ok.workcell_runtime.packet_owners.length === 2);
assert.ok(ok.packets.every((p) => String(p.owner_persona || '').length > 0));
const cp = ok.workcell_runtime.review_checkpoints;
assert.ok(Array.isArray(cp) && cp.length >= 1, 'review_required creates checkpoint');
assert.ok(cp.some((c) => c.review_state === 'pending' && String(c.packet_id) === 'p1'));

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

console.log('test-harness-workcell-runtime-w2b: ok');
