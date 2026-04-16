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

/** @typedef {'fixture_replay' | 'live_openai'} ScenarioRunMode */

/**
 * @param {{
 *   runMode?: ScenarioRunMode,
 *   writeToDisk?: boolean,
 *   fixtures?: { scenario1?: object, scenario2?: object },
 *   now?: () => Date,
 *   scenarios?: Array<'scenario_1_multi_project_spinup' | 'scenario_2_research_to_bundle'>,
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

  /** @type {Array<{envelope: object, classification: object, build_errors: string[] | null}>} */
  const runs = [];

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
