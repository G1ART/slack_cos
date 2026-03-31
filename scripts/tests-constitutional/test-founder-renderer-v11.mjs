/**
 * Constitutional test: Founder Renderer v1.1.
 * Verifies OS surface rendering and internal marker blocking.
 */
import { renderFounderSurface, renderDeliberation } from '../../src/core/founderRenderer.js';
import { FounderSurfaceType, SAFE_FALLBACK_TEXT } from '../../src/core/founderContracts.js';

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

// Test 1: runtime_meta renders text
{
  const r = renderFounderSurface(FounderSurfaceType.RUNTIME_META, { text: 'v1.0' });
  assert('runtime_meta_text', r.text === 'v1.0');
}

// Test 2: safe_fallback always returns fallback text
{
  const r = renderFounderSurface(FounderSurfaceType.SAFE_FALLBACK, {});
  assert('safe_fallback', r.text === SAFE_FALLBACK_TEXT);
}

// Test 3: discovery returns prompt
{
  const r = renderFounderSurface(FounderSurfaceType.DISCOVERY, {});
  assert('discovery_has_text', r.text.length > 0);
  assert('discovery_not_fallback', r.text !== SAFE_FALLBACK_TEXT);
}

// Test 4: Internal markers are blocked
{
  const r = renderFounderSurface(FounderSurfaceType.RUNTIME_META, { text: '종합 추천안: 뭔가' });
  assert('markers_blocked', r.text === SAFE_FALLBACK_TEXT);
}

// Test 5: Persona literals blocked
{
  const r = renderFounderSurface(FounderSurfaceType.RUN_STATE, { text: '- strategy_finance: 좋습니다' });
  assert('persona_blocked', r.text === SAFE_FALLBACK_TEXT);
}

// Test 6: Decision packet renders deliberation
{
  const d = {
    recommendation: '진행하세요',
    one_line_summary: '요약입니다',
    viewpoints: ['관점1', '관점2'],
    objections: ['반론1'],
    risks: ['리스크1'],
    tensions: [],
    next_actions: ['행동1'],
    decision_needed: true,
    decision_question: '결정해 주세요',
  };
  const r = renderDeliberation(d);
  assert('deliberation_has_summary', r.text.includes('요약'));
  assert('deliberation_has_recommendation', r.text.includes('COS 권고'));
  assert('deliberation_has_viewpoints', r.text.includes('관점1'));
  assert('deliberation_has_objection', r.text.includes('반론1'));
  assert('deliberation_has_risk', r.text.includes('리스크1'));
  assert('deliberation_has_action', r.text.includes('행동1'));
  assert('deliberation_has_decision', r.text.includes('결정'));
  assert('deliberation_no_markers', !r.text.includes('종합 추천안'));
  assert('deliberation_no_persona', !r.text.includes('strategy_finance:'));
}

// Test 7: Execution packet renders
{
  const r = renderFounderSurface(FounderSurfaceType.EXECUTION_PACKET, {
    goal_line: 'Build a calendar',
    locked_scope_summary: 'Calendar MVP',
    next_actions: ['시작'],
    packet_id: 'EPK-123',
    run_id: 'R-1',
  });
  assert('exec_pkt_goal', r.text.includes('Build a calendar'));
  assert('exec_pkt_scope', r.text.includes('Calendar MVP'));
  assert('exec_pkt_id', r.text.includes('EPK-123'));
}

// Test 8: Approval packet renders
{
  const r = renderFounderSurface(FounderSurfaceType.APPROVAL_PACKET, {
    topic: '배포 승인',
    recommendation: '진행 권고',
    founder_action_required: '승인 필요',
    next_actions: ['승인', '보류'],
  });
  assert('approval_topic', r.text.includes('배포 승인'));
  assert('approval_action', r.text.includes('승인 필요'));
}

// Test 9: Deploy packet renders
{
  const r = renderFounderSurface(FounderSurfaceType.DEPLOY_PACKET, {
    deploy_status: 'deploy_ready',
    deploy_url: 'https://example.com',
    next_actions: ['배포 확인'],
  });
  assert('deploy_status', r.text.includes('deploy_ready'));
  assert('deploy_url', r.text.includes('https://example.com'));
}

// Test 10: Exception packet renders
{
  const r = renderFounderSurface(FounderSurfaceType.EXCEPTION, {
    error_summary: '디스패치 실패',
    next_actions: ['재시도'],
  });
  assert('exception_error', r.text.includes('디스패치 실패'));
}

// Test 11: Unknown surface type → safe fallback
{
  const r = renderFounderSurface('nonexistent_surface', { text: 'hello' });
  assert('unknown_surface_fallback', r.text === SAFE_FALLBACK_TEXT);
}

// Test 12: Run state surface renders project label
{
  const r = renderFounderSurface(FounderSurfaceType.RUN_STATE, {
    project_label: 'Calendar App',
    current_stage: 'execution_running',
    status: 'active',
    text: '작업 중',
  });
  assert('run_state_label', r.text.includes('Calendar App'));
  assert('run_state_stage', r.text.includes('execution_running'));
}

console.log(`\ntest-founder-renderer-v11: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
