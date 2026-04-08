/**
 * vNext.13.54 — Delegate schema failures → precise blocked_reason + field paths (machine-only).
 */
import assert from 'node:assert';
import { validateToolCallArgs } from '../src/founder/runFounderDirectConversation.js';

const base = {
  objective: 'o',
  personas: null,
  tasks: null,
  deliverables: null,
  constraints: null,
  success_criteria: null,
  risks: null,
  review_checkpoints: null,
  open_questions: null,
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
    },
  ],
};

const r = validateToolCallArgs('delegate_harness_team', base);
assert.equal(r.blocked, true);
assert.equal(r.reason, 'invalid_payload');
assert.equal(r.blocked_reason, 'delegate_schema_invalid_packet_envelope');
assert.ok(Array.isArray(r.invalid_enum_fields));
assert.ok(r.invalid_enum_fields.some((x) => String(x).includes('persona')));
assert.ok(Array.isArray(r.delegate_schema_error_fields));

console.log('test-delegate-schema-invalid-fields-surface-machine-reason: ok');
