/**
 * Constitutional test: Work Phase Resolver.
 * Verifies IntakeStage + Run.current_stage → unified WorkPhase mapping.
 */
import { resolveWorkPhase } from '../../src/core/workPhaseResolver.js';
import { WorkPhase } from '../../src/core/founderContracts.js';

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

// Test 1: No work object → discover
{
  const r = resolveWorkPhase({ resolved: false, primary_type: 'none', run: null, intake_session: null });
  assert('no_object_discover', r.phase === WorkPhase.DISCOVER);
}

// Test 2: Intake active → align
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'intake_session',
    run: null, intake_session: { stage: 'active' },
  });
  assert('intake_active_align', r.phase === WorkPhase.ALIGN);
}

// Test 3: Intake execution_ready → seed
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'intake_session',
    run: null, intake_session: { stage: 'execution_ready' },
  });
  assert('intake_execution_ready_seed', r.phase === WorkPhase.SEED);
}

// Test 4: Intake execution_running → execute
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'intake_session',
    run: null, intake_session: { stage: 'execution_running' },
  });
  assert('intake_execution_running_execute', r.phase === WorkPhase.EXECUTE);
}

// Test 5: Intake approval_pending → approve
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'intake_session',
    run: null, intake_session: { stage: 'approval_pending' },
  });
  assert('intake_approval_pending_approve', r.phase === WorkPhase.APPROVE);
}

// Test 6: Intake completed → monitor
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'intake_session',
    run: null, intake_session: { stage: 'completed' },
  });
  assert('intake_completed_monitor', r.phase === WorkPhase.MONITOR);
}

// Test 7: Run execution_running → execute
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'execution_running', deploy_status: 'none', status: 'active', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_execution_running_execute', r.phase === WorkPhase.EXECUTE);
}

// Test 8: Run deploy_ready → deploy
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'deploy_ready', deploy_status: 'deploy_ready', status: 'active', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_deploy_ready_deploy', r.phase === WorkPhase.DEPLOY);
}

// Test 9: Run approved_for_deploy → deploy
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'approved_for_deploy', deploy_status: 'approved', status: 'active', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_approved_for_deploy_deploy', r.phase === WorkPhase.DEPLOY);
}

// Test 10: Run completed → monitor
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'completed', deploy_status: 'deployed_manual_confirmed', status: 'completed', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_completed_monitor', r.phase === WorkPhase.MONITOR);
}

// Test 11: Run dispatch failed → exception
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'execution_running', deploy_status: 'none', status: 'active', outbound_dispatch_state: 'failed' },
    intake_session: null,
  });
  assert('run_dispatch_failed_exception', r.phase === WorkPhase.EXCEPTION);
}

// Test 12: Run cancelled → exception
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'execution_running', deploy_status: 'none', status: 'cancelled', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_cancelled_exception', r.phase === WorkPhase.EXCEPTION);
}

// Test 13: Run awaiting_founder_action → approve
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'execution_run',
    run: { current_stage: 'execution_running', deploy_status: 'awaiting_founder_action', status: 'active', outbound_dispatch_state: 'completed' },
    intake_session: null,
  });
  assert('run_awaiting_founder_approve', r.phase === WorkPhase.APPROVE);
}

// Test 14: Project space only → discover
{
  const r = resolveWorkPhase({
    resolved: true, primary_type: 'project_space',
    run: null, intake_session: null,
  });
  assert('project_space_only_discover', r.phase === WorkPhase.DISCOVER);
}

// Test 15: phase_source is always present
{
  const r = resolveWorkPhase({ resolved: false, primary_type: 'none', run: null, intake_session: null });
  assert('phase_source_present', typeof r.phase_source === 'string' && r.phase_source.length > 0);
  assert('confidence_present', typeof r.confidence === 'number');
}

console.log(`\ntest-work-phase-resolver: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
