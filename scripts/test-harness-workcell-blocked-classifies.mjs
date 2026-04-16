/**
 * W5-A: harnessWorkcellRuntime.buildHarnessWorkcellRuntime 가 blocked/review_required/escalated/
 * rework_requested 분기에서 W5-A failure_classification 을 부착하고, 정상(active/completed) 분기에서는
 * 부착하지 않는다. 기존 shape(workcell_runtime.summary_lines 등)는 보존.
 */
import assert from 'node:assert/strict';
import {
  buildHarnessWorkcellRuntime,
  classifyWorkcellRuntime,
} from '../src/founder/harnessWorkcellRuntime.js';

function basePackets(overrides = []) {
  return [
    {
      packet_id: 'pkt_1',
      persona: 'engineering',
      review_required: false,
      workcell_completed: false,
    },
    {
      packet_id: 'pkt_2',
      persona: 'research',
      review_required: false,
      workcell_completed: false,
    },
    ...overrides,
  ];
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: 'disp_healthy',
    personas: ['engineering', 'research'],
    packets: basePackets(),
    persona_contract_runtime_snapshot: ['engineering contract ok', 'research contract ok'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.workcell_runtime.status, 'active');
  assert.equal(out.failure_classification, null, 'active workcell → no classification');
  assert.ok(!('failure_classification' in out.workcell_runtime));
  assert.ok(Array.isArray(out.workcell_runtime.summary_lines) && out.workcell_runtime.summary_lines.length > 0);
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: 'disp_review',
    personas: ['engineering', 'research'],
    packets: basePackets([
      {
        packet_id: 'pkt_3',
        persona: 'engineering',
        review_required: true,
        workcell_completed: false,
      },
    ]),
    persona_contract_runtime_snapshot: [],
  });
  assert.equal(out.ok, true);
  assert.equal(out.workcell_runtime.status, 'review_required');
  assert.ok(out.failure_classification, 'review_required → classification attached');
  assert.equal(out.failure_classification.resolution_class, 'model_coordination_failure');
  assert.equal(out.failure_classification.human_gate_required, false);
  assert.equal(out.failure_classification.retryable, false);
  assert.ok(out.failure_classification.human_gate_reason.length > 0);
  assert.equal(out.workcell_runtime.failure_classification.resolution_class, 'model_coordination_failure');
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: 'disp_escalated',
    personas: ['engineering', 'research', 'pm'],
    packets: basePackets([
      {
        packet_id: 'pkt_3',
        persona: 'engineering',
        review_required: false,
        workcell_completed: false,
        escalation_target: 'pm',
      },
    ]),
    persona_contract_runtime_snapshot: [],
  });
  assert.equal(out.ok, true);
  assert.equal(out.workcell_runtime.status, 'escalated');
  assert.ok(out.workcell_runtime.escalation_open);
  assert.deepEqual(out.workcell_runtime.escalation_targets, ['pm']);
  assert.equal(out.failure_classification.resolution_class, 'model_coordination_failure');
  assert.ok(out.failure_classification.human_gate_reason.includes('pm'));
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: 'disp_rework',
    personas: ['engineering'],
    packets: [
      {
        packet_id: 'pkt_1',
        persona: 'engineering',
        review_required: false,
        rework_requested: true,
        workcell_completed: false,
      },
    ],
    persona_contract_runtime_snapshot: [],
  });
  assert.equal(out.ok, true);
  assert.equal(out.workcell_runtime.status, 'rework_requested');
  assert.ok(out.failure_classification);
  assert.equal(out.failure_classification.resolution_class, 'model_coordination_failure');
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: '',
    personas: ['engineering'],
    packets: basePackets(),
    persona_contract_runtime_snapshot: [],
  });
  assert.equal(out.ok, false);
  assert.equal(out.blocked_reason, 'workcell_dispatch_id_missing');
  assert.ok(out.failure_classification, 'construction failure also classified');
  assert.equal(out.failure_classification.resolution_class, 'model_coordination_failure');
}

{
  const out = buildHarnessWorkcellRuntime({
    dispatch_id: 'disp_ok',
    personas: ['engineering'],
    packets: [],
    persona_contract_runtime_snapshot: [],
  });
  assert.equal(out.ok, false);
  assert.equal(out.blocked_reason, 'workcell_packets_empty');
  assert.equal(out.failure_classification.resolution_class, 'model_coordination_failure');
}

{
  assert.equal(classifyWorkcellRuntime(null), null);
  assert.equal(classifyWorkcellRuntime({}), null);
  assert.equal(classifyWorkcellRuntime({ status: 'active' }), null);
  assert.equal(classifyWorkcellRuntime({ status: 'completed' }), null);
  const c = classifyWorkcellRuntime({ status: 'escalated', escalation_targets: ['pm', 'design'] });
  assert.equal(c.resolution_class, 'model_coordination_failure');
  assert.ok(c.human_gate_reason.includes('pm'));
  assert.ok(c.human_gate_reason.includes('design'));
}

console.log('test-harness-workcell-blocked-classifies: ok');
