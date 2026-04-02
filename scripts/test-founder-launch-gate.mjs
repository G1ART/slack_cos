#!/usr/bin/env node
/**
 * Founder launch gate + execution awareness — acceptance & determinism.
 */
import assert from 'node:assert/strict';

import { detectFounderLaunchIntent } from '../src/core/founderLaunchIntent.js';
import { evaluateLaunchReadiness } from '../src/core/launchReadinessEvaluator.js';
import { buildProviderTruthSnapshot } from '../src/core/providerTruthSnapshot.js';
import { founderRequestPipeline } from '../src/core/founderRequestPipeline.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

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

console.log('\n=== Founder Launch Gate ===\n');

/* Determinism: intent detection */
try {
  const meta = { source_type: 'direct_message', channel: 'D1', user: 'U1', ts: '1.0' };
  openProjectIntakeSession(meta, { goalLine: '테스트 프로덕트 킥오프' });
  const threadKey = buildSlackThreadKey(meta);
  for (let i = 0; i < 10; i++) {
    const d = detectFounderLaunchIntent('좋아. 진행하자.', meta, threadKey);
    assert.equal(d.detected, true);
    assert.equal(d.signal, 'affirm_progress');
  }
  ok('detectFounderLaunchIntent determinism x10');
} catch (e) {
  fail('determinism intent', e);
}

/* No context → no launch detect */
try {
  const metaBare = { source_type: 'direct_message', channel: 'D99', user: 'U9', ts: '9.0' };
  const tk = buildSlackThreadKey(metaBare);
  const d = detectFounderLaunchIntent('좋아. 진행하자.', metaBare, tk);
  assert.equal(d.detected, false);
  ok('launch intent requires thread context');
} catch (e) {
  fail('no context', e);
}

/* Readiness blocked: no scope */
try {
  const snap = buildProviderTruthSnapshot({ space: null, run: null });
  const r = evaluateLaunchReadiness({
    workContext: {
      resolved: false,
      primary_type: 'none',
      project_space: null,
      run: null,
      intake_session: null,
      project_id: null,
      run_id: null,
    },
    threadKey: 'x:y:z',
    providerSnapshot: snap,
    metadata: {},
  });
  assert.equal(r.readiness, 'launch_blocked_missing_scope_lock');
  ok('readiness blocks missing scope');
} catch (e) {
  fail('readiness scope', e);
}

/* Pipeline: launch → EXECUTION_PACKET */
try {
  const meta = {
    source_type: 'direct_message',
    channel: 'Dlaunch1',
    user: 'Ulaunch',
    ts: '100.0',
    slack_route_label: 'dm_ai_router',
    callText: async () => {
      throw new Error('callText must not run when launch gate handles');
    },
  };
  openProjectIntakeSession(meta, { goalLine: '더그린 갤러리 스케줄 캘린더 MVP' });

  const out = await founderRequestPipeline({
    text: '좋아. 진행하자.',
    metadata: meta,
    route_label: 'dm_ai_router',
  });

  assert.ok(out, 'pipeline returns');
  assert.equal(out.trace.launch_gate_taken, true);
  assert.equal(out.trace.launch_intent_detected, true);
  assert.equal(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);
  assert.ok(out.trace.launch_packet_id, 'launch_packet_id');
  assert.ok(out.trace.provider_truth_snapshot?.providers?.length, 'provider_truth');
  assert.ok(out.trace.project_space_resolution_mode, 'resolution mode in trace');
  assert.ok(out.text.includes('provider truth') || out.text.includes('Provider truth') || out.text.includes('provider'), 'render has truth');
  assert.ok(out.text.includes('대표 next action') || out.text.includes('next action'), 'next action');
  assert.ok(out.text.includes('수동 브리지'), 'manual bridge section');
  assert.ok(out.text.includes('적용된 기본값'), 'defaults section');
  ok('pipeline launch → EXECUTION_PACKET + trace');
} catch (e) {
  fail('pipeline launch', e);
}

/* Non-launch → natural partner (launch gate not taken) */
try {
  const metaNat = {
    source_type: 'direct_message',
    channel: 'Dnat1',
    user: 'Unat',
    ts: '200.0',
    slack_route_label: 'dm_ai_router',
    callText: async () => 'COS 파트너 짧은 응답',
  };
  openProjectIntakeSession(metaNat, { goalLine: '간단한 킥오프 제품 한 줄' });
  const outNat = await founderRequestPipeline({
    text: '오늘 날씨가 참 좋네요.',
    metadata: metaNat,
    route_label: 'dm_ai_router',
  });
  assert.ok(outNat?.text?.includes('COS 파트너'), 'callText used');
  assert.notEqual(outNat.trace.launch_gate_taken, true);
  assert.equal(outNat.surface_type, FounderSurfaceType.PARTNER_NATURAL);
  ok('non-launch keeps partner_natural path');
} catch (e) {
  fail('non-launch path', e);
}

/* Repeat launch same thread → same surface class + stable packet id */
try {
  const metaR = {
    source_type: 'direct_message',
    channel: 'Drepeat1',
    user: 'Urep',
    ts: '300.0',
    slack_route_label: 'dm_ai_router',
    callText: async () => {
      throw new Error('callText must not run on launch');
    },
  };
  openProjectIntakeSession(metaR, {
    goalLine: '반복 시퀀스 idempotent 전용 스레드 Drepeat1 — cross-test 라벨 매칭 회피',
  });
  const o1 = await founderRequestPipeline({
    text: '좋아. 진행하자.',
    metadata: metaR,
    route_label: 'dm_ai_router',
  });
  const o2 = await founderRequestPipeline({
    text: '진행하자',
    metadata: metaR,
    route_label: 'dm_ai_router',
  });
  assert.equal(o1.surface_type, FounderSurfaceType.EXECUTION_PACKET);
  assert.equal(o2.surface_type, FounderSurfaceType.EXECUTION_PACKET);
  assert.equal(o1.trace.launch_packet_id, o2.trace.launch_packet_id);
  ok('repeat launch idempotent surface + packet id');
} catch (e) {
  fail('repeat launch', e);
}

/* Provider snapshot shape stable */
try {
  const snap = buildProviderTruthSnapshot({ space: null, run: null });
  assert.ok(Array.isArray(snap.providers));
  assert.equal(typeof snap.summary.live_count, 'number');
  const ids = snap.providers.map((p) => p.provider).sort().join(',');
  for (let i = 0; i < 5; i++) {
    const s2 = buildProviderTruthSnapshot({ space: null, run: null });
    assert.equal(s2.providers.map((p) => p.provider).sort().join(','), ids);
  }
  ok('provider truth shape stable x5');
} catch (e) {
  fail('provider shape', e);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
