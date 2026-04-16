/**
 * W8-D — delivery readiness verdict priority:
 *   open_gate > propagation_failed > missing_binding > ready
 */
import assert from 'node:assert/strict';

const { buildDeliveryReadiness } = await import('../src/founder/deliveryReadiness.js');
const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');

const req = buildBindingRequirement({
  project_space_key: 'ps_alpha',
  binding_kind: 'env_requirement',
  source_system: 'cos',
  sink_system: 'railway',
  secret_handling_mode: 'write_only',
  binding_name: 'OPENAI_API_KEY',
});

const graphAllSatisfied = {
  unfulfilled_requirements: [],
  satisfied_requirements: [req],
};
const graphMissing = {
  unfulfilled_requirements: [req],
  satisfied_requirements: [],
};

// 1) ready
{
  const r = buildDeliveryReadiness({
    project_space_key: 'ps_alpha',
    binding_graph: graphAllSatisfied,
    open_human_gates: [],
    recent_propagation_runs: [],
  });
  assert.equal(r.verdict, 'ready');
  assert.equal(r.unresolved_count, 0);
}

// 2) missing_binding
{
  const r = buildDeliveryReadiness({
    project_space_key: 'ps_alpha',
    binding_graph: graphMissing,
    open_human_gates: [],
    recent_propagation_runs: [],
  });
  assert.equal(r.verdict, 'missing_binding');
  assert.equal(r.unresolved_count, 1);
  assert.ok(r.delivery_readiness_compact_lines.some((l) => l.startsWith('missing:')));
}

// 3) propagation_failed trumps missing_binding
{
  const r = buildDeliveryReadiness({
    project_space_key: 'ps_alpha',
    binding_graph: graphMissing,
    open_human_gates: [],
    recent_propagation_runs: [
      {
        run: { id: 'r_1', status: 'failed', failure_resolution_class: 'tool_adapter_unavailable' },
        steps: [
          {
            verification_result: 'failed',
            failure_resolution_class: 'tool_adapter_unavailable',
            sink_system: 'railway',
            binding_name: 'OPENAI_API_KEY',
          },
        ],
      },
    ],
  });
  assert.equal(r.verdict, 'propagation_failed');
  assert.ok(r.last_propagation_failures_lines.length >= 1);
}

// 4) open_gate trumps everything
{
  const r = buildDeliveryReadiness({
    project_space_key: 'ps_alpha',
    binding_graph: graphMissing,
    open_human_gates: [
      { id: 'g_123abcdef', gate_kind: 'oauth_authorization', required_human_action: '승인 필요' },
    ],
    recent_propagation_runs: [
      { run: { id: 'r_1', status: 'failed', failure_resolution_class: 'tool_adapter_unavailable' }, steps: [] },
    ],
  });
  assert.equal(r.verdict, 'open_gate');
  assert.equal(r.unresolved_human_gates_compact_lines.length, 1);
}

console.log('test-delivery-readiness-verdict-priority: ok');
