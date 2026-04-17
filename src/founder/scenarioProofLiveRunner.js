/**
 * W9 — ScenarioProofLiveRunner.
 *
 * 시나리오 러너(run-scenario-1, run-scenario-2) 를 래핑해 live 또는 fixture_replay 모드로
 * 실행하고, ScenarioProofEnvelope 과 Classifier 출력을 묶어 audit 배열을 돌려준다.
 *
 * 운영 원칙:
 *  - Supabase 운영 모드 감지 시 러너 레벨 가드가 먼저 inconclusive 를 반환하므로 이 runner 는
 *    별도로 차단하지 않는다 (단방향 의존: 러너가 가드 SSOT).
 *  - COS_SCENARIO_LIVE_OPENAI 가 아닌 한 live 모드도 runner 내부에서 inconclusive 로 내려앉는다.
 *  - 본 모듈은 외부 write(디스크/Supabase/Slack) 를 하지 않는다 — 저장은 개별 러너가 담당.
 */

import { runScenarioOne } from '../../scripts/scenario/run-scenario-1-multi-project-spinup.mjs';
import { runScenarioTwo } from '../../scripts/scenario/run-scenario-2-research-to-bundle.mjs';
import { classifyScenarioProofEnvelope } from './scenarioProofResultClassifier.js';
import { buildScenarioProofScorecard, toScorecardCompactLines } from './scenarioProofScorecard.js';
import { buildScenarioProofEnvelope } from '../../scripts/scenario/scenarioProofEnvelope.js';
import { getCosRunStoreMode } from './executionRunStore.js';
import {
  getQualifiedCapabilityForSink,
  listKnownSinks,
} from './liveBindingCapabilityRegistry.js';
import {
  readRehearsalEligibility,
  hasAnySandboxSafeEntry,
} from './rehearsalEligibility.js';

/** @typedef {'fixture_replay' | 'live_openai'} ScenarioRunMode */

/**
 * @param {{
 *   runMode?: ScenarioRunMode,
 *   writeToDisk?: boolean,
 *   fixtures?: { scenario1?: object, scenario2?: object },
 *   now?: () => Date,
 *   scenarios?: Array<'scenario_1_multi_project_spinup' | 'scenario_2_research_to_bundle'>,
 *   writers?: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
export async function runScenarioProofLive(opts = {}) {
  const runMode = opts.runMode === 'live_openai' ? 'live_openai' : 'fixture_replay';
  const writeToDisk = opts.writeToDisk === true;
  const now = typeof opts.now === 'function' ? opts.now : () => new Date();
  const fixtures = opts.fixtures && typeof opts.fixtures === 'object' ? opts.fixtures : {};
  const wanted = Array.isArray(opts.scenarios) && opts.scenarios.length > 0
    ? opts.scenarios
    : ['scenario_1_multi_project_spinup', 'scenario_2_research_to_bundle'];
  const env = opts.env || process.env;
  const writersProvided = opts.writers && typeof opts.writers === 'object';

  /** @type {Array<{envelope: object, classification: object, build_errors: string[] | null}>} */
  const runs = [];

  // W11-E bounded live gates: live 모드일 때 누락 조합별로 정직한 cause 로 inconclusive 를 돌려준다.
  const boundedBlock =
    runMode === 'live_openai'
      ? detectLiveBoundaryBlock({
          env,
          writersProvided,
          project_space_key: opts.project_space_key || null,
        })
      : null;
  if (boundedBlock) {
    const isoStart = now().toISOString();
    for (const scenarioId of wanted) {
      const env1 = buildScenarioProofEnvelope({
        scenario_id: scenarioId,
        run_mode: 'live_openai',
        started_at: isoStart,
        finished_at: isoStart,
        outcome: 'inconclusive',
        break_location: 'unclassified',
        break_reason_cause: boundedBlock.cause,
        failure_classification: {
          resolution_class: boundedBlock.resolution_class,
          human_gate_reason: boundedBlock.reason,
          human_gate_action: boundedBlock.action,
        },
        founder_surface_slice: { headline: boundedBlock.headline },
      });
      const envelope = env1 && env1.ok ? env1.envelope : null;
      runs.push({
        envelope,
        classification: envelope ? classifyScenarioProofEnvelope(envelope) : null,
        build_errors: envelope ? null : (env1 && env1.errors) || ['bounded_block_envelope_failed'],
      });
    }
    const scorecard = buildScenarioProofScorecard(runs.map((r) => r.envelope).filter(Boolean));
    const compact_lines = toScorecardCompactLines(scorecard);
    return { run_mode: runMode, runs, scorecard, compact_lines };
  }

  for (const scenarioId of wanted) {
    let res = null;
    try {
      if (scenarioId === 'scenario_1_multi_project_spinup') {
        res = await runScenarioOne({ runMode, writeToDisk, fixture: fixtures.scenario1, now });
      } else if (scenarioId === 'scenario_2_research_to_bundle') {
        res = await runScenarioTwo({ runMode, writeToDisk, fixture: fixtures.scenario2, now });
      } else {
        runs.push({
          envelope: null,
          classification: null,
          build_errors: [`unknown_scenario:${scenarioId}`],
        });
        continue;
      }
    } catch (err) {
      runs.push({
        envelope: null,
        classification: null,
        build_errors: [`runner_crashed:${err && err.message ? err.message : String(err)}`],
      });
      continue;
    }
    if (!res || !res.ok) {
      runs.push({
        envelope: null,
        classification: null,
        build_errors: res && Array.isArray(res.errors) ? res.errors : ['unknown_build_error'],
      });
      continue;
    }
    runs.push({
      envelope: res.envelope,
      classification: classifyScenarioProofEnvelope(res.envelope),
      build_errors: null,
    });
  }

  const scorecard = buildScenarioProofScorecard(runs.map((r) => r.envelope).filter(Boolean));
  const compact_lines = toScorecardCompactLines(scorecard);

  return {
    run_mode: runMode,
    runs,
    scorecard,
    compact_lines,
  };
}

/**
 * W11-E — live rehearsal 가능 여부를 게이트한다. 어느 하나라도 누락이면 bounded block 반환.
 *
 * 순서 (정직한 cause 분리):
 *  1) Supabase 강제 운영 모드 → binding_propagation_stop (테넨시 격리 깨뜨리지 않기 위해 live 금지)
 *  2) COS_SCENARIO_LIVE_OPENAI 미설정 → external_auth_gate (기존 gated 유지)
 *  3) COS_LIVE_BINDING_WRITERS!=1 AND writers 주입 없음 → product_capability_missing
 *  그 외는 null 을 돌려줘 기존 러너가 live 실행을 수행.
 */
function detectLiveBoundaryBlock({ env, writersProvided, project_space_key }) {
  if (getCosRunStoreMode() === 'supabase') {
    // W13-B: rehearsal-safe entry 가 등록된 경우만 Supabase 모드에서도 bounded live rehearsal 허용.
    const eligibility = readRehearsalEligibility({ now: new Date() });
    const anyRehearsalSafe = hasAnySandboxSafeEntry({
      project_space_key: project_space_key || null,
      eligibility,
    });
    if (!anyRehearsalSafe) {
      return {
        cause: 'binding_propagation_stop',
        resolution_class: 'tenancy_or_binding_ambiguity',
        reason:
          'Supabase 운영 모드에서 rehearsal-safe 로 분류된 target 이 없습니다 (ops/rehearsal_eligibility.json 미등록).',
        action:
          'ops/rehearsal_eligibility.json 에 sandbox_safe entry 를 등록한 뒤 재실행해 주세요.',
        headline: '리허설-세이프 경계가 없어 Supabase 모드 라이브 실행을 중단했습니다.',
      };
    }
  }
  if (env.COS_SCENARIO_LIVE_OPENAI !== '1') {
    return {
      cause: 'external_auth_gate',
      resolution_class: 'hil_required_policy_or_product_decision',
      reason: 'COS_SCENARIO_LIVE_OPENAI 가 설정되지 않았습니다.',
      action: '라이브 실행을 원하시면 COS_SCENARIO_LIVE_OPENAI=1 로 명시해 주세요.',
      headline: '라이브 모드 실행이 게이트되어 있습니다.',
    };
  }
  if (env.COS_LIVE_BINDING_WRITERS !== '1' && !writersProvided) {
    return {
      cause: 'product_capability_missing',
      resolution_class: 'technical_capability_missing',
      reason:
        'live 바인딩 writer 가 활성화되지 않았고 호출측이 writers 를 주입하지도 않았습니다.',
      action: 'COS_LIVE_BINDING_WRITERS=1 로 writer 를 켜거나, runner 호출 시 writers 를 주입해 주세요.',
      headline: '라이브 writer 자격이 없어 리허설을 중단했습니다.',
    };
  }
  // W12-D: live 모드라도 qualified registry 에서 live_verified 인 sink 가 하나도 없으면 차단.
  try {
    const sinks = listKnownSinks();
    const anyVerified = sinks.some((s) => {
      const q = getQualifiedCapabilityForSink(s, { now: new Date() });
      return q && q.qualification_status === 'live_verified';
    });
    if (!anyVerified) {
      return {
        cause: 'product_capability_missing',
        resolution_class: 'technical_capability_missing',
        reason:
          '어떤 sink 도 live_verified 상태가 아닙니다. live rehearsal 의 실제 쓰기 근거가 없습니다.',
        action:
          'scripts/qualify-live-binding-capability.mjs 로 최소 1개 sink 를 live_verified 상태로 qualify 한 뒤 다시 실행해 주세요.',
        headline: '라이브 자격이 검증된 sink 가 없어 리허설을 중단했습니다.',
      };
    }
  } catch (_e) {
    // capability 조회 실패는 bounded block 을 추가로 만들지 않는다(기존 러너가 불투명 실패로 내려앉도록).
  }
  return null;
}
