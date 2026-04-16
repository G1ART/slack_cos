/**
 * W2-A closeout: strict output-schema min_fields on harness dispatch path.
 */
import assert from 'node:assert/strict';
import {
  validatePersonaContractHarnessDispatch,
  validatePersonaContractHarnessEnvelope,
} from '../src/founder/personaContractHarness.js';

const bad = validatePersonaContractHarnessDispatch({
  objective: 'o',
  personas: ['engineering'],
  packets: [
    {
      packet_id: 'p_strict',
      persona: 'engineering',
      mission: 'm',
      preferred_tool: 'cursor',
      preferred_action: '',
      packet_status: 'ready',
    },
  ],
});
assert.equal(bad.blocked, true);
assert.equal(bad.blocked_reason, 'persona_contract_output_field_missing');

const ok = validatePersonaContractHarnessDispatch({
  objective: 'o',
  personas: ['engineering'],
  packets: [
    {
      packet_id: 'p_ok',
      persona: 'engineering',
      mission: 'm',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      packet_status: 'ready',
    },
  ],
});
assert.equal(ok.blocked, false);

const loose = validatePersonaContractHarnessEnvelope(
  {
    objective: 'o',
    personas: ['engineering'],
    packets: [
      {
        persona: 'engineering',
        mission: 'm',
        packet_id: '',
      },
    ],
  },
  { strictOutputFields: false },
);
assert.equal(loose.blocked, false);

console.log('test-persona-contract-output-contract-w2a-closeout: ok');
