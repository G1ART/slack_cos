/**
 * W8-D — loadDeliveryReadiness: store 기반 end-to-end. 메모리 스토어에서 binding/gate/propagation run
 * 을 심은 뒤, loadDeliveryReadiness 가 verdict / compact lines 셋을 반환함을 확인.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');
const { openResumableGate } = await import('../src/founder/humanGateRuntime.js');
const { loadDeliveryReadiness } = await import('../src/founder/deliveryReadiness.js');
const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');

store.__resetProjectSpaceBindingMemoryForTests();
engine.__resetPropagationEngineMemoryForTests();

await store.upsertProjectSpace({ project_space_key: 'ps_alpha', display_name: 'Alpha' });

// 1) binding: env NAME for OPENAI_API_KEY → satisfied by existing env_requirement
await store.recordBinding({
  project_space_key: 'ps_alpha',
  binding_kind: 'env_requirement',
  binding_ref: 'OPENAI_API_KEY',
});

// 2) failing propagation run for that binding
const plan = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: [
    buildBindingRequirement({
      project_space_key: 'ps_alpha',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'railway',
      secret_handling_mode: 'write_only',
      binding_name: 'OPENAI_API_KEY',
    }),
  ],
  existingBindings: [],
  sinkCapabilities: { railway: { supports_secret_write: true } },
});
await engine.executePropagationPlan({
  plan,
  writers: {
    railway: {
      write: async () => ({
        wrote_at: null,
        sink_ref: null,
        secret_handling_mode: 'write_only',
        verification_kind: 'smoke',
        verification_result: 'failed',
        live: false,
        failure_resolution_class: 'tool_adapter_unavailable',
      }),
    },
  },
});

// 3) open human gate
await openResumableGate({
  project_space_key: 'ps_alpha',
  gate_kind: 'oauth_authorization',
  gate_reason: 'Supabase 승인',
  required_human_action: 'Supabase console 접속',
});

const r = await loadDeliveryReadiness('ps_alpha');
assert.ok(r, 'loader returned a snapshot');
assert.equal(r.project_space_key, 'ps_alpha');
// open_gate has priority regardless of failed runs
assert.equal(r.verdict, 'open_gate');
assert.ok(r.delivery_readiness_compact_lines.length >= 1);
assert.ok(r.unresolved_human_gates_compact_lines.length >= 1);
assert.ok(r.last_propagation_failures_lines.length >= 1);

// 4) empty project_space → null
const empty = await loadDeliveryReadiness('ps_nonexistent_xyz');
assert.equal(empty, null);

console.log('test-delivery-readiness-loader-end-to-end: ok');
