/**
 * Constitutional test: Council Object-Only contract.
 * Verifies that deliberation objects are properly structured and rendered,
 * and that raw Council text is blocked.
 */
import { synthesisToDeliberation, validateDeliberation } from '../../src/core/internalDeliberation.js';
import { renderDeliberation } from '../../src/core/founderRenderer.js';
import { SAFE_FALLBACK_TEXT } from '../../src/core/founderContracts.js';

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

// Test 1: synthesisToDeliberation converts legacy synthesis format
{
  const synthesis = {
    recommendation: '진행하세요',
    oneLineSummary: '요약',
    strongestObjection: '반론',
    unresolvedTensions: ['쟁점1'],
    keyRisks: ['리스크1'],
    nextActions: ['행동1'],
    decisionNeeded: true,
    decisionQuestion: '결정 질문',
  };
  const d = synthesisToDeliberation(synthesis);
  assert('synth_recommendation', d.recommendation === '진행하세요');
  assert('synth_one_line', d.one_line_summary === '요약');
  assert('synth_objections', d.objections[0] === '반론');
  assert('synth_tensions', d.tensions[0] === '쟁점1');
  assert('synth_risks', d.risks[0] === '리스크1');
  assert('synth_actions', d.next_actions[0] === '행동1');
  assert('synth_decision_needed', d.decision_needed === true);
  assert('synth_decision_question', d.decision_question === '결정 질문');
  assert('synth_approval_needed', d.approval_needed === false);
}

// Test 2: validateDeliberation passes valid object
{
  const d = {
    recommendation: '진행',
    viewpoints: ['v1'],
    objections: ['o1'],
    risks: ['r1'],
    tensions: [],
    next_actions: ['a1'],
    approval_needed: false,
  };
  const issues = validateDeliberation(d);
  assert('valid_deliberation_no_issues', issues.length === 0);
}

// Test 3: validateDeliberation catches missing fields
{
  const issues = validateDeliberation({});
  assert('invalid_has_issues', issues.length > 0);
}

// Test 4: validateDeliberation catches non-object
{
  const issues = validateDeliberation('string');
  assert('string_is_invalid', issues.length > 0 && issues[0] === 'not an object');
}

// Test 5: renderDeliberation produces clean output
{
  const d = {
    recommendation: '권고',
    one_line_summary: '요약',
    viewpoints: ['관점1'],
    objections: ['반론1'],
    risks: ['리스크1'],
    tensions: ['쟁점1'],
    next_actions: ['행동1'],
    decision_needed: false,
    approval_needed: false,
  };
  const r = renderDeliberation(d);
  assert('render_has_summary', r.text.includes('요약'));
  assert('render_has_recommendation', r.text.includes('COS 권고'));
  assert('render_no_old_headers', !r.text.includes('종합 추천안'));
  assert('render_no_persona_headers', !r.text.includes('페르소나별 핵심 관점'));
  assert('render_no_internal', !r.text.includes('내부 처리 정보'));
}

// Test 6: renderDeliberation blocks internal markers injected into fields
{
  const d = {
    recommendation: '종합 추천안: 이것을 하세요',
    viewpoints: [],
    objections: [],
    risks: [],
    tensions: [],
    next_actions: [],
    approval_needed: false,
  };
  const r = renderDeliberation(d);
  assert('injected_marker_blocked', r.text === SAFE_FALLBACK_TEXT);
}

// Test 7: renderDeliberation blocks strategy_finance in viewpoints
{
  const d = {
    recommendation: '진행',
    one_line_summary: '요약',
    viewpoints: ['strategy_finance: 좋습니다'],
    objections: [],
    risks: [],
    tensions: [],
    next_actions: [],
    approval_needed: false,
  };
  const r = renderDeliberation(d);
  assert('persona_in_viewpoint_blocked', r.text === SAFE_FALLBACK_TEXT);
}

// Test 8: Empty deliberation → safe fallback
{
  const r = renderDeliberation(null);
  assert('null_deliberation_fallback', r.text === SAFE_FALLBACK_TEXT);
}

console.log(`\ntest-council-object-only: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
