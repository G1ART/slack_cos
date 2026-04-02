#!/usr/bin/env node
/**
 * vNext.10 — founder hard block + routing lock + trace payload shape
 */
import assert from 'node:assert/strict';

const { sanitizeFounderOutput, formatFounderApprovalAppendix } = await import('../src/features/founderSurfaceGuard.js');
const { sendFounderResponse } = await import('../src/core/founderOutbound.js');

const { finalizeSlackResponse, buildFounderOutputTraceRecord } = await import('../src/features/topLevelRouter.js');
const { tryFinalizeInboundFounderRoutingLock } = await import('../src/features/founderRoutingLockFinalize.js');
const { runInboundTurnTraceScope } = await import('../src/features/inboundTurnTrace.js');
const { gateFounderFacingTextForSlackPost } = await import('../src/slack/founderOutboundGate.js');
const {
  classifyFounderRoutingLock,
  formatMetaDebugSurfaceText,
} = await import('../src/features/inboundFounderRoutingLock.js');
const { isCouncilCommand } = await import('../src/slack/councilCommandPrefixes.js');

let passed = 0;
let failed = 0;
function ok(name) {
  passed++;
  console.log(`  PASS: ${name}`);
}
function fail(name, e) {
  failed++;
  console.error(`  FAIL: ${name}`, e?.message || e);
}

console.log('\n=== vNext.10 Leak Path + Council Hard Block ===\n');

/* 1–3: sanitizer */
try {
  const h =
    '종합 추천안\n레거시\n\n페르소나별 핵심 관점\n- x\n\n가장 강한 반대 논리\nz\n\n핵심 리스크\n- r\n\n대표 결정 필요 여부\n예';
  const c = sanitizeFounderOutput(h);
  assert.ok(!c.includes('종합 추천안'));
  assert.ok(!c.includes('페르소나별'));
  assert.ok(!c.includes('승인 대기열'));
  ok('founderSurfaceGuard strips old council headings');
} catch (e) {
  fail('founderSurfaceGuard strips old council headings', e);
}

try {
  const p = '요약\n- strategy_finance: 너무 비쌉니다\n- risk_review: 반대합니다\n다음';
  const c = sanitizeFounderOutput(p);
  assert.ok(!c.includes('strategy_finance:'));
  assert.ok(!c.includes('risk_review:'));
  ok('founderSurfaceGuard strips persona literal lines');
} catch (e) {
  fail('founderSurfaceGuard strips persona literal lines', e);
}

try {
  const q = '본문\n\n승인 대기열\n- 상태: pending\n- 승인 ID: APR-1';
  const c = sanitizeFounderOutput(q);
  assert.ok(!c.includes('승인 대기열'));
  ok('founderSurfaceGuard strips approval queue raw block');
} catch (e) {
  fail('founderSurfaceGuard strips approval queue raw block', e);
}

/* 4: council + old body */
try {
  const poison = '종합 추천안\n포이즌\n\n페르소나별 핵심 관점\n- a';
  const out = finalizeSlackResponse({
    responder: 'council',
    text: poison,
    raw_text: 't',
    normalized_text: 't',
    response_type: 'test_council_poison',
    source_formatter: 'test:council_poison',
    slack_route_label: 'mention_ai_router',
  });
  assert.ok(out.includes('종합 추천안'), '창업자 멘션 라벨이면 pass-through');
  assert.ok(out.includes('페르소나별'));
  ok('mention_ai_router + council body passes through (no shape rewrite)');
} catch (e) {
  fail('council old-style hard block', e);
}

try {
  const personaOnly = '- strategy_finance: 반대\n- risk_review: 우려';
  const outP = finalizeSlackResponse({
    responder: 'council',
    text: personaOnly,
    raw_text: 't',
    normalized_text: 't',
    response_type: 'test_council_persona_only',
    source_formatter: 'test:persona_only',
    slack_route_label: 'mention_ai_router',
  });
  assert.ok(outP.includes('strategy_finance'));
  assert.ok(outP.includes('risk_review'));
  ok('mention_ai_router persona lines pass through');
} catch (e) {
  fail('council persona-only leak', e);
}

try {
  const poison2 = '종합 추천안\n포이즌\n\n페르소나별 핵심 관점\n- a';
  const outCh = finalizeSlackResponse({
    responder: 'council',
    text: poison2,
    raw_text: 't',
    normalized_text: 't',
    response_type: 'test_council_poison_channel',
    source_formatter: 'test:non_founder_channel',
    slack_route_label: null,
    founder_route: false,
  });
  assert.ok(!outCh.includes('종합 추천안'), '비창업자/라벨 없음은 기존 차단');
  ok('non-founder finalize still rewrites council-shaped body');
} catch (e) {
  fail('non-founder council rewrite', e);
}

/* 5–7 routing lock */
try {
  const kick = '오늘부터 테스트용 작은 프로젝트 하나 시작하자';
  assert.equal(classifyFounderRoutingLock(kick)?.kind, 'kickoff_test');
  assert.ok(!isCouncilCommand(kick));
  ok('kickoff routing lock phrase not council command');
} catch (e) {
  fail('kickoff routing lock', e);
}

try {
  assert.equal(classifyFounderRoutingLock('버전')?.kind, 'version');
  assert.ok(!isCouncilCommand('버전'));
  ok('version routing lock not council command');
} catch (e) {
  fail('version routing lock', e);
}

try {
  assert.equal(classifyFounderRoutingLock('G1COS 버전')?.kind, 'version');
  assert.equal(classifyFounderRoutingLock('G1COS버전')?.kind, 'version');
  assert.equal(classifyFounderRoutingLock('*G1COS* 버전')?.kind, 'version');
  ok('version routing lock folds G1COS / markdown prefix');
} catch (e) {
  fail('version routing lock G1COS prefix', e);
}

try {
  const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');
  const r = await founderRequestPipeline({
    text: 'G1COS 버전',
    metadata: { source_type: 'channel_mention', user: 'U1', channel: 'C1', ts: '1.0' },
    route_label: 'mention_ai_router',
  });
  assert.ok(r?.text, 'pipeline returns text');
  assert.ok(/G1\s*COS\s*Runtime|release_sha/i.test(r.text), r.text.slice(0, 160));
  ok('founderRequestPipeline: G1COS 버전 → runtime meta');
} catch (e) {
  fail('founderRequestPipeline version prefix', e);
}

try {
  const meta = classifyFounderRoutingLock('COS responder는 어떻게 동작해?');
  assert.equal(meta?.kind, 'meta_debug');
  assert.ok(formatMetaDebugSurfaceText().includes('버전'));
  assert.ok(!isCouncilCommand('COS responder는 어떻게 동작해?'));
  ok('meta question routing lock');
} catch (e) {
  fail('meta routing lock', e);
}

try {
  const oneLine = classifyFounderRoutingLock('responder surface sanitize 한 줄로만 말해');
  assert.equal(oneLine?.kind, 'meta_debug');
  ok('meta brief directive (한 줄로만) routing lock');
} catch (e) {
  fail('meta brief directive routing lock', e);
}

try {
  const routed = await tryFinalizeInboundFounderRoutingLock({
    trimmed: 'responder surface sanitize 한 줄로만 말해',
    routerCtx: {
      raw_text: 'x',
      normalized_text: 'responder surface sanitize 한 줄로만 말해',
    },
    metadata: { slack_route_label: 'mention_ai_router' },
  });
  assert.ok(routed && typeof routed === 'string');
  assert.ok(routed.includes('운영 메타'), 'meta_debug_surface body');
  assert.ok(!routed.includes('종합 추천안'));
  ok('tryFinalizeInboundFounderRoutingLock meta surface string');
} catch (e) {
  fail('founderRoutingLockFinalize meta', e);
}

/* 8 trace builder */
try {
  const rec = buildFounderOutputTraceRecord({
    inbound_turn_id: 'tid',
    responder: 'council',
    response_type: 'x',
    source_formatter: 'unit:trace',
    slack_route_label: 'dm_ai_router',
    raw_before_sanitize: 'aa',
    sanitized: 'bb',
    raw_for_detection: '종합 추천안',
    leak_scan: true,
  });
  assert.equal(rec.source_formatter, 'unit:trace');
  assert.equal(rec.slack_route_label, 'dm_ai_router');
  assert.equal(rec.route_label, 'dm_ai_router');
  assert.equal(rec.passed_finalize, true);
  assert.equal(rec.passed_sanitize, true);
  assert.equal(rec.passed_outbound_validation, true);
  assert.equal(rec.validation_error_code, null);
  assert.ok(rec.contains_old_council_markers);
  assert.equal(rec.stage, 'founder_output_trace');
  ok('buildFounderOutputTraceRecord has source_formatter + route + flags');
} catch (e) {
  fail('trace record shape', e);
}

/* 9 regression snapshot */
try {
  const snap = [
    '종합 추천안',
    '페르소나별 핵심 관점',
    '가장 강한 반대 논리',
    '핵심 리스크',
    '내부 처리 정보',
    '- x',
    '승인 대기열',
    '- strategy_finance: bad',
    '- risk_review: bad',
  ].join('\n');
  const out = sanitizeFounderOutput(snap);
  for (const banned of [
    '종합 추천안',
    '페르소나별 핵심 관점',
    '가장 강한 반대 논리',
    '핵심 리스크',
    '내부 처리 정보',
    '승인 대기열',
    'strategy_finance:',
    'risk_review:',
  ]) {
    assert.ok(!out.includes(banned), `snapshot must omit ${banned}`);
  }
  ok('regression snapshot: banned substrings absent');
} catch (e) {
  fail('regression snapshot', e);
}

/* appendix helper */
try {
  const ap = formatFounderApprovalAppendix('APR-TEST-1');
  assert.ok(ap.includes('승인 ID'));
  assert.ok(!ap.includes('승인 대기열'));
  ok('formatFounderApproval appendix founder-safe');
} catch (e) {
  fail('approval appendix', e);
}

try {
  const fallback = sanitizeFounderOutput('종합 추천안\n- x');
  assert.ok(!/한\s*번\s*더\s*보내/u.test(fallback), 'retry prompt wording must not exist');
  ok('hard fallback copy does not request retry');
} catch (e) {
  fail('hard fallback retry wording ban', e);
}

try {
  /** @type {Array<Record<string, unknown>>} */
  const sent = [];
  await sendFounderResponse({
    say: async (payload) => {
      if (typeof payload === 'string') sent.push({ text: payload });
      else sent.push(payload);
    },
    thread_ts: '1700000000.123',
    rendered_text: '안전 텍스트',
    rendered_blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*종합 추천안* leak candidate' } }],
    surface_type: 'executive_kickoff_surface',
    responder_kind: 'executive_surface',
    intent: 'PROJECT_KICKOFF',
  });
  assert.equal(sent.length, 1);
  assert.equal(Array.isArray(sent[0].blocks), false, 'founder outbound must be text-only');
  assert.equal(String(sent[0].text).includes('종합 추천안'), false);
  ok('sendFounderResponse disables founder block payload path');
} catch (e) {
  fail('sendFounderResponse text-only lock', e);
}

try {
  const prevEnforce = process.env.COS_ENFORCE_FOUNDER_GATE;
  process.env.COS_ENFORCE_FOUNDER_GATE = '1';
  try {
    await runInboundTurnTraceScope({ channel: 'C1', user: 'U1', ts: '1.0' }, 'ping', async () => {
      try {
        gateFounderFacingTextForSlackPost('any');
        throw new Error('expected gate throw without finalize');
      } catch (e) {
        assert.ok(String(e.message).includes('finalize'), e.message);
      }
      return 'inner';
    });
    ok('gate enforces finalize when COS_ENFORCE_FOUNDER_GATE=1');
  } finally {
    if (prevEnforce === undefined) delete process.env.COS_ENFORCE_FOUNDER_GATE;
    else process.env.COS_ENFORCE_FOUNDER_GATE = prevEnforce;
  }
} catch (e) {
  fail('gate finalize enforcement', e);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
