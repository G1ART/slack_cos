#!/usr/bin/env node
/**
 * Founder launch + 레거시 raw-text intent 회귀(scripts 전용) + 아티팩트 게이트 스모크.
 * vNext.13.5: detectFounderLaunchIntentRawText 는 legacy 모듈만.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { detectFounderLaunchIntentRawText } from '../src/legacy/founderLaunchIntentRawText.js';
import { evaluateLaunchReadiness } from '../src/core/launchReadinessEvaluator.js';
import { buildProviderTruthSnapshot } from '../src/core/providerTruthSnapshot.js';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-flg-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'founder-conv.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const launchPid = 'mock-proposal-launch';
const launchAid = 'mock-approval-launch';
const lineageRow = (tk) => ({
  thread_key: tk,
  latest_proposal_artifact_id: launchPid,
  latest_approval_artifact_id: launchAid,
  last_founder_confirmation_at: '2026-04-01T12:00:00.000Z',
  last_founder_confirmation_kind: 'test_fixture',
  approval_lineage_status: 'confirmed',
});
await fs.writeFile(
  process.env.FOUNDER_CONVERSATION_STATE_FILE,
  JSON.stringify({
    by_thread: {
      'im:Dlaunch1': lineageRow('im:Dlaunch1'),
      'im:Drepeat1': lineageRow('im:Drepeat1'),
    },
  }),
  'utf8',
);

function launchMockRow(goalLine, lockedScope) {
  const pid = launchPid;
  const aid = launchAid;
  return {
    natural_language_reply: '구조화 실행 아티팩트에 따라 스파인을 연결합니다.',
    state_delta: {
      latest_proposal_artifact_id: pid,
      latest_approval_artifact_id: aid,
      last_founder_confirmation_at: '2026-04-01T12:00:00.000Z',
      last_founder_confirmation_kind: 'test_fixture',
      approval_lineage_status: 'confirmed',
    },
    conversation_status: 'execution_ready',
    proposal_artifact: { _cos_artifact_id: pid, understood_request: 'launch' },
    approval_artifact: { _cos_artifact_id: aid },
    execution_artifact: {
      request_execution_spine: true,
      source_proposal_artifact_id: pid,
      source_approval_artifact_id: aid,
      goal_line: goalLine,
      locked_scope_summary: lockedScope,
    },
    follow_up_questions: [],
    requires_founder_confirmation: false,
  };
}

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

/* Legacy raw-text intent (회귀 전용 모듈) */
try {
  const meta = { source_type: 'direct_message', channel: 'D1', user: 'U1', ts: '1.0' };
  openProjectIntakeSession(meta, { goalLine: '테스트 프로덕트 킥오프' });
  const threadKey = buildSlackThreadKey(meta);
  for (let i = 0; i < 10; i++) {
    const d = detectFounderLaunchIntentRawText('좋아. 진행하자.', meta, threadKey);
    assert.equal(d.detected, true);
    assert.equal(d.signal, 'affirm_progress');
  }
  ok('detectFounderLaunchIntentRawText determinism x10');
} catch (e) {
  fail('determinism intent', e);
}

try {
  const metaBare = { source_type: 'direct_message', channel: 'D99', user: 'U9', ts: '9.0' };
  const tk = buildSlackThreadKey(metaBare);
  const d = detectFounderLaunchIntentRawText('좋아. 진행하자.', metaBare, tk);
  assert.equal(d.detected, false);
  ok('launch intent requires thread context');
} catch (e) {
  fail('no context', e);
}

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

try {
  const goalLine = '더그린 갤러리 스케줄 캘린더 MVP';
  const meta = {
    source_type: 'direct_message',
    channel: 'Dlaunch1',
    user: 'Ulaunch',
    ts: '100.0',
    slack_route_label: 'dm_ai_router',
    mockFounderPlannerRow: launchMockRow(goalLine, '캘린더 MVP · 외부 예약 우선'),
    callText: async () => {
      throw new Error('callText must not run when launch gate handles');
    },
  };
  openProjectIntakeSession(meta, { goalLine });

  const out = await runFounderDirectKernel({
    text: '좋아. 진행하자.',
    metadata: meta,
    route_label: 'dm_ai_router',
  });

  assert.ok(out, 'pipeline returns');
  assert.equal(out.trace.launch_gate_taken, true);
  assert.equal(out.trace.founder_artifact_gated_launch, true);
  assert.equal(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);
  assert.ok(out.trace.launch_packet_id, 'launch_packet_id');
  assert.ok(out.trace.provider_truth_snapshot?.providers?.length, 'provider_truth');
  assert.ok(out.trace.project_space_resolution_mode, 'resolution mode in trace');
  assert.ok(out.text.includes('provider truth') || out.text.includes('Provider truth') || out.text.includes('provider'), 'render has truth');
  assert.ok(out.text.includes('대표 next action') || out.text.includes('next action'), 'next action');
  assert.ok(out.text.includes('수동 브리지'), 'manual bridge section');
  assert.ok(out.text.includes('적용된 기본값'), 'defaults section');
  ok('pipeline artifact launch → EXECUTION_PACKET + trace');
} catch (e) {
  fail('pipeline launch', e);
}

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
  const outNat = await runFounderDirectKernel({
    text: '오늘 날씨가 참 좋네요.',
    metadata: metaNat,
    route_label: 'dm_ai_router',
  });
  assert.ok(!outNat?.text?.includes('[COS 제안 패킷]'), 'vNext.13.7: natural surface without packet');
  assert.ok(outNat?.text?.includes('COS 파트너'), 'callText used in 보강');
  assert.notEqual(outNat.trace.launch_gate_taken, true);
  assert.equal(outNat.surface_type, FounderSurfaceType.PARTNER_NATURAL);
  ok('non-launch uses partner_natural + optional partner 보강');
} catch (e) {
  fail('non-launch path', e);
}

try {
  const goalR = '반복 시퀀스 idempotent 전용 스레드 Drepeat1 — cross-test 라벨 매칭 회피';
  const metaR = {
    source_type: 'direct_message',
    channel: 'Drepeat1',
    user: 'Urep',
    ts: '300.0',
    slack_route_label: 'dm_ai_router',
    mockFounderPlannerRow: launchMockRow(goalR, '반복 스레드 스코프'),
    callText: async () => {
      throw new Error('callText must not run on launch');
    },
  };
  openProjectIntakeSession(metaR, { goalLine: goalR });
  const o1 = await runFounderDirectKernel({
    text: '좋아. 진행하자.',
    metadata: metaR,
    route_label: 'dm_ai_router',
  });
  const o2 = await runFounderDirectKernel({
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

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
