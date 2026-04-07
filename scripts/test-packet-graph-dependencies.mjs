import assert from 'node:assert';
import { findNextRunnablePacket, buildPacketsById } from '../src/founder/runProgressor.js';

const packets = [
  {
    packet_id: 'pA',
    packet_status: 'ready',
    preferred_tool: 'cursor',
    preferred_action: 'create_spec',
    mission: 'a',
  },
  {
    packet_id: 'pB',
    packet_status: 'ready',
    preferred_tool: 'cursor',
    preferred_action: 'create_spec',
    mission: 'b',
    depends_on: ['pA'],
  },
];
const byId = buildPacketsById({ harness_snapshot: { packets } });

const m1 = { pA: 'queued', pB: 'queued' };
assert.equal(findNextRunnablePacket(['pA', 'pB'], m1, byId), 'pA');
assert.equal(findNextRunnablePacket(['pB'], m1, byId), null);

const m2 = { pA: 'queued', pB: 'queued' };
assert.equal(findNextRunnablePacket(['pB', 'pA'], m2, byId), 'pA');

const m3 = { pA: 'completed', pB: 'queued' };
assert.equal(findNextRunnablePacket(['pA', 'pB'], m3, byId), 'pB');

const m4 = { pA: 'completed', pB: 'completed' };
assert.equal(findNextRunnablePacket(['pA', 'pB'], m4, byId), null);

console.log('test-packet-graph-dependencies: ok');
