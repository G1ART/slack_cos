/**
 * vNext.13.49 — OpenAI-strict-shaped delegate packet + live_patch passes validateToolCallArgs (nullables aligned).
 */
import assert from 'node:assert';
import { validateToolCallArgs } from '../src/founder/runFounderDirectConversation.js';
import { validateDelegateHarnessTeamToolArgs } from '../src/founder/delegateHarnessPacketValidate.js';

function minimalPacket() {
  return {
    packet_id: null,
    persona: 'engineering',
    mission: 'narrow live patch',
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
      path: 'docs/smoke-minimal.txt',
      operation: 'create',
      content: 'exact\n',
      live_only: true,
      no_fallback: true,
    },
  };
}

const args = {
  objective: 'objective line',
  personas: null,
  tasks: null,
  deliverables: null,
  constraints: null,
  success_criteria: null,
  risks: null,
  review_checkpoints: null,
  open_questions: null,
  packets: [minimalPacket()],
};

const v1 = validateDelegateHarnessTeamToolArgs(args);
assert.equal(v1.blocked, false);
assert.equal(v1.delegate_schema_valid, true);

const v2 = validateToolCallArgs('delegate_harness_team', args);
assert.equal(v2.blocked, false);

console.log('test-delegate-harness-minimal-live-packet-passes-strict-schema: ok');
