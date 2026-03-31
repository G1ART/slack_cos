/**
 * Constitutional test: Packet Assembler.
 * Verifies executor results are correctly assembled into founder-facing packets.
 */
import { assemblePacket, makeUtilityPacket } from '../../src/core/packetAssembler.js';
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

const mockWorkContext = {
  resolved: true,
  primary_type: 'execution_run',
  project_space: null,
  run: { run_id: 'R-1', project_id: 'P-1', project_goal: 'Test', locked_mvp_summary: 'MVP', current_stage: 'execution_running', status: 'active', deploy_status: 'none', packet_id: 'EPK-1', project_label: 'Test Project' },
  intake_session: null,
  project_id: 'P-1',
  run_id: 'R-1',
  phase_hint: 'execute',
  confidence: 90,
};

// Test 1: Discovery packet
{
  const pkt = assemblePacket({ text: 'hello' }, { ...mockWorkContext, resolved: false, primary_type: 'none' }, { phase: WorkPhase.DISCOVER });
  assert('discovery_type', pkt.packet_type === 'discovery');
  assert('discovery_action', typeof pkt.founder_action_required === 'string');
}

// Test 2: Align packet
{
  const pkt = assemblePacket({ text: 'kickoff', packet_id: 'PKT-1' }, mockWorkContext, { phase: WorkPhase.ALIGN });
  assert('align_type', pkt.packet_type === 'align');
  assert('align_text', pkt.text === 'kickoff');
}

// Test 3: Execution packet (lock/seed)
{
  const pkt = assemblePacket({ text: 'locked', goal_line: 'Build X', run_id: 'R-1' }, mockWorkContext, { phase: WorkPhase.LOCK });
  assert('execution_type', pkt.packet_type === 'execution');
  assert('execution_goal', pkt.goal_line === 'Build X');
  assert('execution_run_id', pkt.run_id === 'R-1');
}

// Test 4: Run state packet (execute/review)
{
  const pkt = assemblePacket({ text: 'running' }, mockWorkContext, { phase: WorkPhase.EXECUTE });
  assert('run_state_type', pkt.packet_type === 'run_state');
  assert('run_state_current_stage', pkt.current_stage === 'execution_running');
  assert('run_state_project_label', pkt.project_label === 'Test Project');
}

// Test 5: Approval packet
{
  const pkt = assemblePacket({ text: 'approve?', topic: 'Deploy' }, mockWorkContext, { phase: WorkPhase.APPROVE });
  assert('approval_type', pkt.packet_type === 'approval');
  assert('approval_topic', pkt.topic === 'Deploy');
  assert('approval_action', pkt.founder_action_required.includes('승인'));
}

// Test 6: Deploy packet
{
  const pkt = assemblePacket({ text: 'deploy' }, mockWorkContext, { phase: WorkPhase.DEPLOY });
  assert('deploy_type', pkt.packet_type === 'deploy');
}

// Test 7: Monitor packet
{
  const pkt = assemblePacket({ text: 'monitoring' }, mockWorkContext, { phase: WorkPhase.MONITOR });
  assert('monitor_type', pkt.packet_type === 'monitor');
  assert('monitor_no_action', pkt.founder_action_required === null);
}

// Test 8: Exception packet
{
  const pkt = assemblePacket({ text: 'error', error_summary: 'Dispatch failed' }, mockWorkContext, { phase: WorkPhase.EXCEPTION });
  assert('exception_type', pkt.packet_type === 'exception');
  assert('exception_error', pkt.error_summary === 'Dispatch failed');
}

// Test 9: Utility packet
{
  const pkt = makeUtilityPacket({ text: 'version info' }, mockWorkContext);
  assert('utility_type', pkt.packet_type === 'utility');
  assert('utility_text', pkt.text === 'version info');
}

// Test 10: work_ref is always present
{
  const pkt = assemblePacket({ text: 'test' }, mockWorkContext, { phase: WorkPhase.EXECUTE });
  assert('work_ref_present', pkt.work_ref !== undefined);
  assert('work_ref_type', pkt.work_ref.type === 'execution_run');
  assert('work_ref_id', pkt.work_ref.id === 'R-1');
}

// Test 11: next_actions defaults to empty array
{
  const pkt = assemblePacket({ text: 'test' }, mockWorkContext, { phase: WorkPhase.MONITOR });
  assert('next_actions_array', Array.isArray(pkt.next_actions));
}

// Test 12: null executor → utility
{
  const pkt = assemblePacket(null, mockWorkContext, { phase: WorkPhase.DISCOVER });
  assert('null_executor_utility', pkt.packet_type === 'utility');
}

console.log(`\ntest-packet-assembler: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
