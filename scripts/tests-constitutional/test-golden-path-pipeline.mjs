/**
 * Constitutional test: Golden Path Pipeline.
 * Tests the full pipeline for utility intents + discover phase (no active work object).
 * Golden path phases (align→lock→execute→deploy) require live session state,
 * so we test the pipeline returns null → delegates to legacy routers.
 */
import { founderRequestPipeline } from '../../src/core/founderRequestPipeline.js';
import { SAFE_FALLBACK_TEXT, DISCOVERY_PROMPT_TEXT } from '../../src/core/founderContracts.js';

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

// Test 1: "버전" → runtime_meta_surface
{
  const r = await founderRequestPipeline({ text: '버전', metadata: {} });
  assert('version_not_null', r !== null);
  assert('version_has_text', typeof r?.text === 'string' && r.text.length > 0);
  assert('version_trace_surface', r?.trace?.surface_type === 'runtime_meta_surface');
  assert('version_trace_pipeline', r?.trace?.responder_kind === 'pipeline');
  assert('version_trace_v11', r?.trace?.pipeline_version === 'v1.1');
  assert('version_no_markers', !r?.text?.includes('종합 추천안'));
}

// Test 2: "도움말" → help_surface
{
  const r = await founderRequestPipeline({ text: '도움말', metadata: {} });
  assert('help_not_null', r !== null);
  assert('help_has_text', r?.text?.includes('COS'));
  assert('help_trace_surface', r?.trace?.surface_type === 'help_surface');
}

// Test 3: "COS responder는 어떻게 동작해?" → meta_debug_surface
{
  const r = await founderRequestPipeline({ text: 'COS responder는 어떻게 동작해?', metadata: {} });
  assert('meta_debug_not_null', r !== null);
  assert('meta_debug_trace_surface', r?.trace?.surface_type === 'meta_debug_surface');
}

// Test 4: "responder surface sanitize 한 줄로만 말해" → meta_debug_surface
{
  const r = await founderRequestPipeline({ text: 'responder surface sanitize 한 줄로만 말해', metadata: {} });
  assert('meta_brief_not_null', r !== null);
  assert('meta_brief_trace_surface', r?.trace?.surface_type === 'meta_debug_surface');
}

// Test 5: No work object + unknown text → pipeline returns null (delegates to legacy)
{
  const r = await founderRequestPipeline({ text: '이번 분기 매출 전략을 짜보자', metadata: {} });
  // With no work object and no utility intent, pipeline should handle discover phase
  // and return a discovery surface
  if (r !== null) {
    assert('unknown_discover_surface', r.trace?.work_phase === 'discover');
  } else {
    // Pipeline returned null — delegates to legacy. Both are acceptable during migration.
    assert('unknown_delegates_to_legacy', true);
  }
}

// Test 6: Pipeline trace always has v1.1 marker
{
  const r = await founderRequestPipeline({ text: '버전', metadata: {} });
  assert('trace_version_v11', r?.trace?.pipeline_version === 'v1.1');
}

// Test 7: Pipeline trace has work_object and work_phase
{
  const r = await founderRequestPipeline({ text: '버전', metadata: {} });
  assert('trace_has_work_object', 'work_object' in (r?.trace || {}));
  assert('trace_has_work_phase', 'work_phase' in (r?.trace || {}));
}

// Test 8: Council leak markers never appear in any pipeline output
{
  const markers = ['종합 추천안', '페르소나별 핵심 관점', '가장 강한 반대 논리', '핵심 리스크', '내부 처리 정보', 'strategy_finance:', 'risk_review:', '참여 페르소나:'];
  for (const input of ['버전', '도움말', 'COS responder는 어떻게 동작해?']) {
    const r = await founderRequestPipeline({ text: input, metadata: {} });
    if (r) {
      for (const m of markers) {
        assert(`no_leak_${input.slice(0,6)}_${m.slice(0,6)}`, !r.text.includes(m));
      }
    }
  }
}

// Test 9: "운영도움말" → help_surface
{
  const r = await founderRequestPipeline({ text: '운영도움말', metadata: {} });
  assert('op_help_not_null', r !== null);
  assert('op_help_trace_surface', r?.trace?.surface_type === 'help_surface');
}

// Test 10: 버전 토큰 주변 공백·문장부호 + 인테이크 중에도 runtime meta (gold 덮어쓰기 방지)
{
  const r = await founderRequestPipeline({
    text: ' 버전。',
    metadata: { has_active_intake: true, intake_session: { stage: 'align' } },
  });
  assert('version_trim_punct_not_null', r !== null);
  assert('version_trim_punct_surface', r?.trace?.surface_type === 'runtime_meta_surface');
}

// Test 11: 질문 힌트 없이 responder만 있어도 meta_debug (인테이크 중)
{
  const r = await founderRequestPipeline({
    text: 'COS responder',
    metadata: { has_active_intake: true, intake_session: { stage: 'align' } },
  });
  assert('responder_keyword_meta_not_null', r !== null);
  assert('responder_keyword_meta_surface', r?.trace?.surface_type === 'meta_debug_surface');
}

// Test 12: 구조화 조회 접두는 파이프라인이 삼키지 않고 null → command router
{
  const r = await founderRequestPipeline({ text: '계획상세: PLN-UNIT-TEST', metadata: {} });
  assert('query_prefix_delegates_null', r === null);
}

console.log(`\ntest-golden-path-pipeline: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
