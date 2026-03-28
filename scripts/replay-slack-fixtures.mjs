#!/usr/bin/env node
/**
 * Slack payload fixture 회귀 — inbound 추출 → 동기 스냅샷 → query/planner/council 1차 분류.
 * Council LLM 은 호출하지 않음.
 *
 * Run: node scripts/replay-slack-fixtures.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ensureStorage } from '../src/storage/jsonStore.js';
import { getInboundCommandText } from '../src/slack/inboundText.js';
import { buildRouterSyncSnapshot } from '../src/testing/routerSyncSnapshot.js';
import { classifyInboundResponderPreview } from '../src/testing/inboundResponderClassify.js';
import { finalizeSlackResponse } from '../src/features/topLevelRouter.js';
import { assertNoCouncilLeakInNonCouncilResponse } from '../src/testing/councilLeakRules.js';
import { classifySurfaceIntent } from '../src/features/surfaceIntentClassifier.js';
import {
  PLANNER_SLACK_EMPTY_BODY_MESSAGE,
  PLANNER_SLACK_ROUTING_MISS_MESSAGE,
} from '../src/features/plannerRoute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, 'fixtures', 'slack');

const MANUAL_SLACK_TESTS = [
  '채널에서 @봇 멘션 후 `계획상세 <실존 PLN-ID>` — 구조화 응답·Council 장문 비발생 확인',
  '채널에서 `/g1cos 계획상세 <PLN-ID>` — Slash Command 등록 후 in_channel 조회 응답 확인',
  '`계획등록: <짧은 본문>` — planner 계약 응답·저장·(필요 시) 승인 버튼까지',
  '`협의모드: <짧은 질문>` — Council 전용 장문(페르소나·추천안 등)만 여기서 나오는지 확인',
  '평문 한 줄(접두 없음) — 자연어 COS 대화(dialog)·Council 비진입 확인',
  '`COS …` / `비서 …` — 내비게이터(JSON)·평문 대화와 응답 톤 구분 확인',
];

function loadFixtures() {
  const names = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('.json'));
  names.sort();
  return names.map((n) => {
    const full = path.join(FIX_DIR, n);
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  });
}

/**
 * handleUserText AI 구간과 동일한 **축약** 분류.
 * @see classifyInboundResponderPreview
 */
async function classifyFixture(inbound, snap) {
  const trimmed = snap.trimmed;
  const preview = await classifyInboundResponderPreview(snap);

  if (preview.responder === 'lineage_transport' && preview.lineageText != null) {
    const finalized_text = finalizeSlackResponse({
      responder: 'query',
      text: preview.lineageText,
      raw_text: inbound,
      normalized_text: trimmed,
      query_match: false,
      council_blocked: true,
      response_type: preview.lineageResponseType ?? 'lineage_transport',
    });
    return { final_responder: 'query', finalized_text };
  }

  if (preview.responder === 'executive_surface' && preview.surfaceRaw != null) {
    const pkt = preview.surfacePacketId ?? null;
    const stp = preview.surfaceStatusPacketId ?? null;
    const finalized_text = finalizeSlackResponse({
      responder: 'executive_surface',
      text: preview.surfaceRaw,
      raw_text: inbound,
      normalized_text: trimmed,
      command_name: pkt ? 'decision_packet' : preview.surfaceResponseType ?? 'executive_surface',
      council_blocked: true,
      response_type: preview.surfaceResponseType ?? 'executive_surface',
      packet_id: pkt,
      status_packet_id: stp,
    });
    return { final_responder: 'executive_surface', finalized_text };
  }

  if (preview.responder === 'query' && preview.queryRaw != null) {
    const finalized_text = finalizeSlackResponse({
      responder: 'query',
      text: preview.queryRaw,
      raw_text: inbound,
      normalized_text: trimmed,
      query_match: true,
      council_blocked: true,
      response_type: 'fixture_query',
    });
    return { final_responder: 'query', finalized_text };
  }

  if (preview.responder === 'planner') {
    return { final_responder: 'planner', finalized_text: null, planner_lock: snap.planner_lock };
  }

  return { final_responder: preview.responder, finalized_text: null };
}

function checkPlannerGolden(kind, inbound, snap) {
  const raw = kind === 'empty_body' ? PLANNER_SLACK_EMPTY_BODY_MESSAGE : PLANNER_SLACK_ROUTING_MISS_MESSAGE;
  const finalized_text = finalizeSlackResponse({
    responder: 'planner',
    text: raw,
    raw_text: inbound,
    normalized_text: snap.trimmed,
    planner_match: true,
    council_blocked: true,
    response_type: `fixture_planner_${kind}`,
  });
  const leak = assertNoCouncilLeakInNonCouncilResponse(finalized_text, { responder: 'planner' });
  return { finalized_text, leak };
}

async function runOne(fixture) {
  const id = fixture.id;
  const exp = fixture.expect || {};
  const errors = [];
  const warnings = [];

  if (exp.placeholder) {
    return {
      id,
      status: 'skip',
      reason: 'representative_placeholder — event/expect 채우기 전',
      snapshot: null,
      final_responder: null,
      council_leak: false,
    };
  }

  const inbound = getInboundCommandText(fixture.event || {});
  const snap = buildRouterSyncSnapshot(inbound);

  if (exp.surface_intent != null) {
    const cs = classifySurfaceIntent(inbound);
    if (cs?.intent !== exp.surface_intent) {
      errors.push(`surface_intent want ${exp.surface_intent} got ${cs?.intent ?? 'null'}`);
    }
  }

  if (exp.planner_lock_type != null && snap.planner_lock.type !== exp.planner_lock_type) {
    errors.push(`planner_lock_type want ${exp.planner_lock_type} got ${snap.planner_lock.type}`);
  }
  if (exp.empty_body === true) {
    const eb = snap.planner_lock.type === 'hit' && snap.planner_lock.req?.empty_body === true;
    if (!eb) errors.push(`empty_body want true got lock=${JSON.stringify(snap.planner_lock)}`);
  }
  if (exp.query_prefix !== undefined && snap.query_prefix !== exp.query_prefix) {
    errors.push(`query_prefix want ${JSON.stringify(exp.query_prefix)} got ${JSON.stringify(snap.query_prefix)}`);
  }
  if (exp.target_id !== undefined && snap.target_id !== exp.target_id) {
    errors.push(`target_id want ${JSON.stringify(exp.target_id)} got ${JSON.stringify(snap.target_id)}`);
  }

  const cls = await classifyFixture(inbound, snap);

  if (exp.final_responder && cls.final_responder !== exp.final_responder) {
    errors.push(`final_responder want ${exp.final_responder} got ${cls.final_responder}`);
  }

  let finalizedText = cls.finalized_text;
  let councilLeak = false;
  let leakDetail = null;

  if (
    (cls.final_responder === 'query' || cls.final_responder === 'executive_surface') &&
    finalizedText != null
  ) {
    const leak = assertNoCouncilLeakInNonCouncilResponse(finalizedText, {
      responder: cls.final_responder,
    });
    if (!leak.ok) {
      councilLeak = true;
      leakDetail = leak;
      errors.push(`council_leak: ${leak.reason}`);
    }
    for (const sub of exp.response_contains || []) {
      if (!finalizedText.includes(sub)) {
        errors.push(`response missing substring: ${JSON.stringify(sub)}`);
      }
    }
    for (const sub of exp.response_forbidden || []) {
      if (finalizedText.includes(sub)) {
        errors.push(`response must not contain: ${JSON.stringify(sub)}`);
      }
    }
  }

  if (cls.final_responder === 'planner' && exp.planner_golden) {
    const { finalized_text, leak } = checkPlannerGolden(exp.planner_golden, inbound, snap);
    finalizedText = finalized_text;
    if (!leak.ok) {
      councilLeak = true;
      leakDetail = leak;
      errors.push(`planner council_leak: ${leak.reason}`);
    }
    if (exp.planner_golden === 'empty_body') {
      if (!finalizedText.includes('비어')) errors.push('planner empty golden: expected 비어');
    }
    if (exp.planner_golden === 'routing_miss') {
      if (!finalizedText.includes('인식하지 못했습니다')) errors.push('planner miss golden shape');
    }
  }

  if (exp.skip_response_body && cls.final_responder === 'help') {
    /* no body */
  }

  return {
    id,
    status: errors.length ? 'fail' : 'pass',
    errors,
    warnings,
    snapshot: {
      query_prefix: snap.query_prefix,
      planner_lock_type: snap.planner_lock.type,
      target_id: snap.target_id,
      trimmed_head: snap.trimmed.slice(0, 120),
    },
    final_responder: cls.final_responder,
    council_leak: councilLeak,
    leak_detail: leakDetail,
  };
}

async function main() {
  await ensureStorage();

  const fixtures = loadFixtures();
  const results = [];

  console.log('\n=== Slack fixture replay ===\n');

  for (const fx of fixtures) {
    try {
      const r = await runOne(fx);
      results.push(r);
      const mark = r.status === 'pass' ? 'PASS' : r.status === 'skip' ? 'SKIP' : 'FAIL';
      console.log(`${mark}  ${r.id}`);
      if (r.snapshot) {
        console.log(
          `      responder=${r.final_responder}  query_prefix=${JSON.stringify(r.snapshot.query_prefix)}  planner_lock=${r.snapshot.planner_lock_type}  target_id=${JSON.stringify(r.snapshot.target_id)}`
        );
      } else {
        console.log(`      ${r.reason || ''}`);
      }
      if (r.council_leak) {
        console.log(`      *** COUNCIL LEAK *** ${r.leak_detail?.hit || ''}`);
      }
      if (r.errors?.length) {
        for (const e of r.errors) console.log(`      - ${e}`);
      }
    } catch (e) {
      results.push({ id: fx.id, status: 'fail', errors: [String(e?.message || e)] });
      console.log(`FAIL  ${fx.id}`);
      console.log(`      - ${e?.message || e}`);
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const leaks = results.filter((r) => r.council_leak).map((r) => r.id);

  console.log('\n--- Summary ---');
  console.log(`passed: ${passed}  failed: ${failed}  skipped: ${skipped}`);
  if (leaks.length) console.log(`council_leak fixtures: ${leaks.join(', ')}`);
  else console.log('council_leak fixtures: (none)');

  console.log('\n--- 대표 수동 Slack 테스트 (최종 5건) ---');
  MANUAL_SLACK_TESTS.forEach((t, i) => console.log(`${i + 1}. ${t}`));

  console.log('\n--- Next patch recommendation ---');
  console.log(
    'Path: `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` + Memo `COS_NorthStar_Alignment_Memo_2026-03-24.md` — M2a→M2b; M4=thin transport on packet/trace; Directive §4. 조회: `SLACK_QUERY_*`.'
  );

  console.log('\n### Owner actions (copy-paste ready)');
  console.log('1. SQL to run: (스키마 변경 없으면 생략)');
  console.log('2. Local: npm test   또는   npm run test:fixtures');
  console.log('3. Git: git status → 필요한 경로만 git add → git commit -m "…" → git push');
  console.log('4. Hosted: 배포 후 수동 Slack 테스트 (가이드 `COS_Operator_QA_Guide_And_Test_Matrix.md`)\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
