/**
 * W11 — Cross-project contamination regression.
 *
 * 같은 workspace/product 안에서 서로 다른 project_space_key 두 개를 준비하고
 *   (a) bindings, (b) open human gates, (c) propagation runs
 * 를 각각 주입한 뒤, project_space_key 별로 조회한 결과가 **서로 섞이지 않아야** 한다.
 *
 * 검증 지점:
 *   1. projectSpaceBindingStore.listOpenHumanGates(ps) 는 주어진 space 의 gate 만 돌려준다.
 *   2. envSecretPropagationEngine.listRecentPropagationRunsForSpace(ps) 는 주어진 space 의 run 만 돌려준다.
 *   3. deliveryReadiness.loadDeliveryReadiness(ps) 는 space 별로 독립된 결과를 산출한다.
 *   4. humanGateResumeAuditLines / propagationRunAuditLines 는 반대편 space 키/ID 를 절대 포함하지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';
process.env.COS_MEMORY_TEST_TENANCY_DEFAULTS = '1';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');
const readiness = await import('../src/founder/deliveryReadiness.js');
const { buildHumanGateResumeAuditLines } = await import(
  '../src/founder/humanGateResumeAuditLines.js'
);
const { buildPropagationRunAuditLines } = await import(
  '../src/founder/propagationRunAuditLines.js'
);
const humanGate = await import('../src/founder/humanGateRuntime.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');

store.__resetProjectSpaceBindingMemoryForTests();
engine.__resetPropagationEngineMemoryForTests?.();

const workspace = 'cos_memory_test_workspace_key';
const product = 'cos_memory_test_product_key';

const PS_A = `pspace_cross_A_${Date.now()}`;
const PS_B = `pspace_cross_B_${Date.now()}`;

// 1) 두 space 등록
for (const key of [PS_A, PS_B]) {
  await store.upsertProjectSpace({
    project_space_key: key,
    workspace_key: workspace,
    product_key: product,
  });
  await store.recordBinding({
    project_space_key: key,
    workspace_key: workspace,
    product_key: product,
    binding_kind: 'repo_binding',
    binding_ref: `owner/${key}`,
    actor: 'cross-proof',
  });
}

// 2) A 에만 open human gate (resumable) 추가
const openedA = await humanGate.openResumableGate({
  project_space_key: PS_A,
  workspace_key: workspace,
  product_key: product,
  gate_kind: 'manual_secret_entry',
  required_human_action: 'A 전용 조치',
  resume_target_kind: 'packet',
  resume_target_ref: 'packet_A_only',
  continuation_packet_id: 'packet_A',
  continuation_run_id: 'run_A',
  continuation_thread_key: 'thread_A',
});
assert.ok(openedA && openedA.id, 'gate opened');

// 3) B 에만 propagation run (succeeded) 기록 — space 별 격리 확인용
const reqsB = [
  buildBindingRequirement({
    project_space_key: PS_B,
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'github',
    secret_handling_mode: 'smoke_only',
    binding_name: 'API_TOKEN_B',
  }),
];
const planB = buildPropagationPlan({
  project_space_key: PS_B,
  requirements: reqsB,
  existingBindings: [
    { binding_kind: 'env_requirement', binding_ref: 'API_TOKEN_B' },
  ],
});
await engine.executePropagationPlan({
  plan: planB,
  writers: {
    github: {
      write: async () => ({
        wrote_at: null,
        sink_ref: 'acme/beta',
        secret_handling_mode: 'smoke_only',
        verification_kind: 'smoke',
        verification_result: 'ok',
        live: false,
      }),
    },
  },
});

// ===== 격리 검증 =====

// (1) human gate: A 만 보이고 B 는 비어야 한다
const gatesA = await store.listOpenHumanGates(PS_A);
const gatesB = await store.listOpenHumanGates(PS_B);
assert.equal(gatesA.length, 1);
assert.equal(gatesA[0].project_space_key, PS_A);
assert.equal(gatesB.length, 0, `B should have no gates, got ${gatesB.length}`);

// (2) propagation runs: B 만 보이고 A 는 비어야 한다
const runsA = await engine.listRecentPropagationRunsForSpace(PS_A);
const runsB = await engine.listRecentPropagationRunsForSpace(PS_B);
assert.equal(runsA.length, 0, `A should have no runs, got ${runsA.length}`);
assert.equal(runsB.length, 1);
assert.equal(runsB[0].run.project_space_key, PS_B);

// (3) delivery readiness: space 별로 독립
const readyA = await readiness.loadDeliveryReadiness(PS_A);
const readyB = await readiness.loadDeliveryReadiness(PS_B);
assert.ok(readyA, 'A has readiness');
assert.ok(readyB, 'B has readiness');
assert.equal(readyA.project_space_key, PS_A);
assert.equal(readyB.project_space_key, PS_B);
assert.equal(readyA.verdict, 'open_gate', 'A has open gate → verdict open_gate');
assert.ok(['ready', 'missing_binding'].includes(readyB.verdict), `B verdict=${readyB.verdict}`);

// (4) audit lines: 반대편 space 의 키/ID 누출 금지
const auditA = buildHumanGateResumeAuditLines({
  project_space_key: PS_A,
  human_gates: [...gatesA, ...gatesB],
});
const auditAJoined = auditA.human_gate_resume_audit_lines.join('\n');
assert.ok(!auditAJoined.includes(PS_B), 'A audit must not contain B space key');
assert.ok(!/run_B/.test(auditAJoined));

const runAuditB = buildPropagationRunAuditLines({
  project_space_key: PS_B,
  recent_propagation_runs: [...runsA, ...runsB],
});
const runAuditBJoined = runAuditB.propagation_run_audit_lines.join('\n');
assert.ok(!runAuditBJoined.includes(PS_A), 'B audit must not contain A space key');
assert.ok(!runAuditBJoined.includes('packet_A_only'));

// (5) readiness compact lines 자체도 상대 space 키를 누설하지 않는다
const readyAJoined = [
  ...(readyA.delivery_readiness_compact_lines || []),
  ...(readyA.unresolved_human_gates_compact_lines || []),
  ...(readyA.last_propagation_failures_lines || []),
].join('\n');
const readyBJoined = [
  ...(readyB.delivery_readiness_compact_lines || []),
  ...(readyB.unresolved_human_gates_compact_lines || []),
  ...(readyB.last_propagation_failures_lines || []),
].join('\n');
assert.ok(!readyAJoined.includes(PS_B));
assert.ok(!readyBJoined.includes(PS_A));

console.log('test-cross-project-contamination-no-mix: ok');
