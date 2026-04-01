/**
 * Constitutional test: Policy Engine.
 * Verifies actor+state+risk+capability policy decisions.
 */
import { evaluatePolicy } from '../../src/core/policyEngine.js';
import { WorkPhase, Actor, RiskClass } from '../../src/core/founderContracts.js';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Test 1: deny_raw_internal_text is ALWAYS true
{
  for (const phase of Object.values(WorkPhase)) {
    const p = evaluatePolicy({ work_phase: phase });
    assert(`deny_raw_${phase}`, p.deny_raw_internal_text === true);
  }
}

// Test 2: Founder is always allowed
{
  const p = evaluatePolicy({ actor: Actor.FOUNDER, work_phase: WorkPhase.EXECUTE });
  assert('founder_allowed', p.allow === true);
}

// Test 3: Discover phase → dialogue_surface (policyEngine PHASE_SURFACE_MAP)
{
  const p = evaluatePolicy({ work_phase: WorkPhase.DISCOVER });
  assert('discover_surface', p.required_surface_type === 'dialogue_surface');
}

// Test 4: Align phase → dialogue_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.ALIGN });
  assert('align_surface', p.required_surface_type === 'dialogue_surface');
}

// Test 5: Execute phase → status_report_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.EXECUTE });
  assert('execute_surface', p.required_surface_type === 'status_report_surface');
}

// Test 6: Approve phase → orchestration_handoff_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.APPROVE });
  assert('approve_surface', p.required_surface_type === 'orchestration_handoff_surface');
}

// Test 7: Deploy phase → deploy_packet_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.DEPLOY });
  assert('deploy_surface', p.required_surface_type === 'deploy_packet_surface');
}

// Test 8: Monitor phase → monitoring_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.MONITOR });
  assert('monitor_surface', p.required_surface_type === 'monitoring_surface');
}

// Test 9: Exception phase → exception_surface
{
  const p = evaluatePolicy({ work_phase: WorkPhase.EXCEPTION });
  assert('exception_surface', p.required_surface_type === 'exception_surface');
}

// Test 10: requires_packet for execution phases
{
  for (const phase of [WorkPhase.LOCK, WorkPhase.SEED, WorkPhase.EXECUTE, WorkPhase.APPROVE, WorkPhase.DEPLOY]) {
    const p = evaluatePolicy({ work_phase: phase });
    assert(`requires_packet_${phase}`, p.requires_packet === true);
  }
}

// Test 11: does NOT require packet for discovery/align/monitor
{
  for (const phase of [WorkPhase.DISCOVER, WorkPhase.ALIGN, WorkPhase.MONITOR]) {
    const p = evaluatePolicy({ work_phase: phase });
    assert(`no_packet_${phase}`, p.requires_packet === false);
  }
}

// Test 12: requires_approval for irreversible risk
{
  const p = evaluatePolicy({ work_phase: WorkPhase.EXECUTE, risk_class: RiskClass.IRREVERSIBLE });
  assert('irreversible_requires_approval', p.requires_approval === true);
}

// Test 13: requires_approval for external_side_effect risk
{
  const p = evaluatePolicy({ work_phase: WorkPhase.EXECUTE, risk_class: RiskClass.EXTERNAL_SIDE_EFFECT });
  assert('external_side_effect_requires_approval', p.requires_approval === true);
}

// Test 14: Utility intent overrides surface in discover phase
{
  const p = evaluatePolicy({ work_phase: WorkPhase.DISCOVER, intent_signal: 'runtime_meta' });
  assert('utility_override_runtime_meta', p.required_surface_type === 'runtime_meta_surface');
}

// Test 15: Help intent override
{
  const p = evaluatePolicy({ work_phase: WorkPhase.DISCOVER, intent_signal: 'help' });
  assert('utility_override_help', p.required_surface_type === 'help_surface');
}

// Test 16: allowed_capabilities is always an array
{
  const p = evaluatePolicy({ work_phase: WorkPhase.EXECUTE });
  assert('capabilities_array', Array.isArray(p.allowed_capabilities));
  assert('capabilities_non_empty', p.allowed_capabilities.length > 0);
}

console.log(`\ntest-policy-engine: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
