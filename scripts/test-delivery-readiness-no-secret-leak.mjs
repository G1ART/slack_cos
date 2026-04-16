/**
 * W8-D — delivery readiness compact lines 및 슬라이스에 secret value / token / 전체 URL 이 노출되지 않는다.
 */
import assert from 'node:assert/strict';

const { buildDeliveryReadiness } = await import('../src/founder/deliveryReadiness.js');

const secretTokenLike = 'sk-live-EXTREMELYSECRET1234567890ABCDEFGHIJK';
const bearerLike = 'eyJ-FAKE-JWT-VALUE-Abcdefgh.rest';
const fullUrl = 'https://xxxxxx.supabase.co/rest/v1/';

const missingReq = {
  project_space_key: 'ps_alpha',
  binding_kind: 'env_requirement',
  source_system: 'cos',
  sink_system: 'railway',
  secret_handling_mode: 'write_only',
  binding_name: 'OPENAI_API_KEY',
};

const r = buildDeliveryReadiness({
  project_space_key: 'ps_alpha',
  binding_graph: {
    unfulfilled_requirements: [missingReq],
    satisfied_requirements: [],
  },
  open_human_gates: [
    {
      id: 'g_abcdef123456',
      gate_kind: 'oauth_authorization',
      required_human_action: `Supabase 승인 필요 (token ${secretTokenLike}, bearer ${bearerLike}, url ${fullUrl})`,
    },
  ],
  recent_propagation_runs: [
    {
      run: { id: 'r_xyz', status: 'failed', failure_resolution_class: 'tool_adapter_unavailable' },
      steps: [
        {
          verification_result: 'failed',
          failure_resolution_class: 'tool_adapter_unavailable',
          sink_system: 'railway',
          binding_name: 'OPENAI_API_KEY',
          note: `raw secret=${secretTokenLike}`,
        },
      ],
    },
  ],
});

const allLines = [
  ...r.delivery_readiness_compact_lines,
  ...r.unresolved_human_gates_compact_lines,
  ...r.last_propagation_failures_lines,
];

for (const line of allLines) {
  assert.ok(!line.includes(secretTokenLike), 'must not leak secret-like token');
  assert.ok(!line.includes(bearerLike), 'must not leak bearer-like jwt');
  // full absolute URL (https://...) should not appear verbatim
  assert.ok(!/https?:\/\//.test(line), 'must not leak a full absolute URL');
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{8,}/.test(line), 'must not leak bearer header');
}

// also require that compact lines are finite small lists
assert.ok(r.delivery_readiness_compact_lines.length <= 12);
assert.ok(r.unresolved_human_gates_compact_lines.length <= 6);
assert.ok(r.last_propagation_failures_lines.length <= 10);

// verdict is still open_gate (priority)
assert.equal(r.verdict, 'open_gate');

console.log('test-delivery-readiness-no-secret-leak: ok');
