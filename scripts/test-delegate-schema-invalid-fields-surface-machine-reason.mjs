/**
 * vNext.13.54 — 봉투 enum/필드는 런타임에서 막지 않음(스키마·COS·페르소나).
 * live_patch·슬롯 형식만 기계 차단.
 */
import assert from 'node:assert';
import { validateToolCallArgs } from '../src/founder/runFounderDirectConversation.js';

const nullTail = {
  personas: null,
  tasks: null,
  deliverables: null,
  constraints: null,
  success_criteria: null,
  risks: null,
  review_checkpoints: null,
  open_questions: null,
};

const badPersonaPacket = {
  objective: 'o',
  ...nullTail,
  packets: [
    {
      packet_id: null,
      persona: 'not_a_real_persona',
      mission: 'm',
      inputs: null,
      deliverables: [],
      definition_of_done: [],
      handoff_to: '',
      artifact_format: 'md',
      preferred_tool: null,
      preferred_action: null,
      review_required: null,
      review_focus: null,
      packet_status: null,
      live_patch: null,
      success_criteria: null,
    },
  ],
};

const rPersona = validateToolCallArgs('delegate_harness_team', badPersonaPacket);
assert.equal(rPersona.blocked, false, 'envelope/persona is not a runtime gate');
assert.equal(rPersona.delegate_schema_valid, true);

const badLivePatch = {
  objective: 'o',
  ...nullTail,
  packets: [
    {
      packet_id: null,
      persona: 'pm',
      mission: 'm',
      inputs: null,
      deliverables: [],
      definition_of_done: [],
      handoff_to: '',
      artifact_format: 'md',
      preferred_tool: null,
      preferred_action: null,
      review_required: null,
      review_focus: null,
      packet_status: null,
      live_patch: {
        path: '',
        operation: 'create',
        content: 'x',
        live_only: true,
        no_fallback: true,
      },
      success_criteria: null,
    },
  ],
};

const rLive = validateToolCallArgs('delegate_harness_team', badLivePatch);
assert.equal(rLive.blocked, true);
assert.equal(rLive.reason, 'invalid_payload');
assert.equal(rLive.blocked_reason, 'delegate_schema_invalid_live_patch_shape');
assert.ok(Array.isArray(rLive.delegate_schema_error_fields));

const badSlot = {
  objective: 'o',
  ...nullTail,
  packets: [null],
};
const rSlot = validateToolCallArgs('delegate_harness_team', badSlot);
assert.equal(rSlot.blocked, true);
assert.equal(rSlot.blocked_reason, 'delegate_schema_invalid_packets_transport');

const badSuccessCrit = {
  objective: 'o',
  ...nullTail,
  packets: [
    {
      packet_id: null,
      persona: 'pm',
      mission: 'm',
      inputs: null,
      deliverables: [],
      definition_of_done: [],
      handoff_to: '',
      artifact_format: 'md',
      preferred_tool: null,
      preferred_action: null,
      review_required: null,
      review_focus: null,
      packet_status: null,
      live_patch: null,
      success_criteria: 123,
    },
  ],
};
const rSc = validateToolCallArgs('delegate_harness_team', badSuccessCrit);
assert.equal(rSc.blocked, true);
assert.equal(rSc.blocked_reason, 'delegate_schema_invalid_packets_transport');
assert.ok(
  (rSc.delegate_schema_error_fields || []).some((f) => String(f).includes('success_criteria')),
);

console.log('test-delegate-schema-invalid-fields-surface-machine-reason: ok');
