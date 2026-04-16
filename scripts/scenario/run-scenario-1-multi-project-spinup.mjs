#!/usr/bin/env node
/**
 * W6-A Scenario 1 runner — multi-project spinup proof harness.
 *
 * 목적(W5-W7 §10): 다중 project_space 를 동시에 열고 repo/deploy/db binding 이 정확히 귀속되며,
 * human gate 가 필요한 구간은 명시적으로 표현되는지, founder 표면이 jargon 없이 볼 수 있는지 증명한다.
 *
 * 운영 원칙:
 *  - 기본은 fixture replay(OpenAI 호출 없음). live OpenAI 경로는 COS_SCENARIO_LIVE_OPENAI=1 게이트.
 *  - 테넄시 격리를 위해 parcel_deployment_key='scenario_local' 고정(운영 배포와 충돌 금지).
 *  - store 는 in-memory 모드만 사용(이 러너가 Supabase 에 쓰지 않는다). getCosRunStoreMode() 가
 *    supabase 면 즉시 inconclusive 로 종료한다.
 *  - 산출물: scripts 표준출력 JSON + 옵션적으로 ops/scenario_runs/<timestamp>.json 기록.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildScenarioProofEnvelope } from './scenarioProofEnvelope.js';
import {
  applyProjectSpaceAction,
  listBindingsForSpace,
  listOpenHumanGates,
} from '../../src/founder/toolPlane/lanes/projectSpaceLane.js';
import {
  __resetProjectSpaceBindingMemoryForTests,
} from '../../src/founder/projectSpaceBindingStore.js';
import { getCosRunStoreMode } from '../../src/founder/executionRunStore.js';

const SCENARIO_ID = 'scenario_1_multi_project_spinup';
const PARCEL_DEPLOYMENT_KEY = 'scenario_local';

/**
 * @param {{
 *   runMode?: 'fixture_replay' | 'live_openai',
 *   fixture?: object,
 *   writeToDisk?: boolean,
 *   now?: () => Date,
 *   resetStore?: boolean,
 * }} [opts]
 */
export async function runScenarioOne(opts = {}) {
  const now = opts.now || (() => new Date());
  const runMode = opts.runMode === 'live_openai' ? 'live_openai' : 'fixture_replay';
  const startedAt = now();

  if (runMode === 'live_openai' && process.env.COS_SCENARIO_LIVE_OPENAI !== '1') {
    const finishedAt = now();
    return buildScenarioProofEnvelope({
      scenario_id: SCENARIO_ID,
      run_mode: 'live_openai',
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      outcome: 'inconclusive',
      break_location: 'unclassified',
      founder_surface_slice: { headline: '라이브 모드 실행이 게이트되어 있습니다.' },
      failure_classification: {
        resolution_class: 'hil_required_policy_or_product_decision',
        human_gate_reason: 'COS_SCENARIO_LIVE_OPENAI 가 설정되지 않았습니다.',
        human_gate_action: '라이브 실행을 원하시면 COS_SCENARIO_LIVE_OPENAI=1 로 명시해 주세요.',
      },
    });
  }

  // Supabase 모드 방어: 시나리오 러너는 메모리 격리만 보장한다.
  if (getCosRunStoreMode() === 'supabase') {
    const finishedAt = now();
    return buildScenarioProofEnvelope({
      scenario_id: SCENARIO_ID,
      run_mode: runMode,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      outcome: 'inconclusive',
      break_location: 'unclassified',
      founder_surface_slice: { headline: '운영 Supabase 에서는 시나리오 러너를 돌리지 않습니다.' },
      failure_classification: {
        resolution_class: 'tenancy_or_binding_ambiguity',
        human_gate_reason: 'run_store_mode=supabase 상태에서 in-memory 격리를 보장할 수 없습니다.',
        human_gate_action: '로컬 실행으로 전환한 뒤 다시 시도해 주세요.',
      },
    });
  }

  if (opts.resetStore !== false) __resetProjectSpaceBindingMemoryForTests();

  const fixture = opts.fixture || defaultFixture();
  /** @type {Array<{step_id:string,status:string,note?:string,evidence_ref?:string,failure_classification?:object}>} */
  const steps = [];
  const observedKeys = new Set();
  let breakLocation = 'none';
  let envelopeFailure = null;
  let headline = '두 프로젝트가 독립적으로 열렸습니다.';

  try {
    for (const space of fixture.project_spaces) {
      observedKeys.add(space.project_space_key);
      // 1) repo binding
      const repoRes = await applyProjectSpaceAction(
        'bind_repo',
        { project_space_key: space.project_space_key, binding_ref: space.repo_ref },
        {
          parcel_deployment_key: PARCEL_DEPLOYMENT_KEY,
          product_key: space.product_key,
          evidence_run_id: space.spinup_run_id,
        },
      );
      if (!repoRes.ok) {
        steps.push({
          step_id: `bind_repo:${space.project_space_key}`,
          status: 'blocked',
          note: repoRes.blocked_reason || null,
          failure_classification: repoRes.failure_classification,
        });
        breakLocation = 'repo_binding';
        envelopeFailure = repoRes.failure_classification;
        headline = `${space.display_name} 레포 연결이 막혔습니다.`;
        break;
      }
      steps.push({ step_id: `bind_repo:${space.project_space_key}`, status: 'ok', evidence_ref: repoRes.binding?.id || null });

      // 2) deploy binding
      const deployRes = await applyProjectSpaceAction(
        'bind_deploy',
        { project_space_key: space.project_space_key, binding_ref: space.deploy_ref },
        { parcel_deployment_key: PARCEL_DEPLOYMENT_KEY, product_key: space.product_key },
      );
      if (!deployRes.ok) {
        steps.push({
          step_id: `bind_deploy:${space.project_space_key}`,
          status: 'blocked',
          note: deployRes.blocked_reason || null,
          failure_classification: deployRes.failure_classification,
        });
        breakLocation = 'deploy_binding';
        envelopeFailure = deployRes.failure_classification;
        headline = `${space.display_name} 배포 연결이 막혔습니다.`;
        break;
      }
      steps.push({ step_id: `bind_deploy:${space.project_space_key}`, status: 'ok', evidence_ref: deployRes.binding?.id || null });

      // 3) db binding
      const dbRes = await applyProjectSpaceAction(
        'bind_db',
        { project_space_key: space.project_space_key, binding_ref: space.db_ref },
        { parcel_deployment_key: PARCEL_DEPLOYMENT_KEY, product_key: space.product_key },
      );
      if (!dbRes.ok) {
        steps.push({
          step_id: `bind_db:${space.project_space_key}`,
          status: 'blocked',
          note: dbRes.blocked_reason || null,
          failure_classification: dbRes.failure_classification,
        });
        breakLocation = 'db_binding';
        envelopeFailure = dbRes.failure_classification;
        headline = `${space.display_name} DB 연결이 막혔습니다.`;
        break;
      }
      steps.push({ step_id: `bind_db:${space.project_space_key}`, status: 'ok', evidence_ref: dbRes.binding?.id || null });

      // 4) optional human gate (fixture 에 명시된 경우만 — 가짜 HIL 생성 금지)
      if (space.human_gate) {
        const gateRes = await applyProjectSpaceAction(
          'open_human_gate',
          {
            project_space_key: space.project_space_key,
            gate_kind: space.human_gate.gate_kind,
          },
          {
            parcel_deployment_key: PARCEL_DEPLOYMENT_KEY,
            product_key: space.product_key,
            gate_reason: space.human_gate.reason,
            gate_action: space.human_gate.action,
          },
        );
        if (!gateRes.ok) {
          steps.push({
            step_id: `open_human_gate:${space.project_space_key}`,
            status: 'failed',
            failure_classification: gateRes.failure_classification,
          });
          breakLocation = 'human_gate';
          envelopeFailure = gateRes.failure_classification;
          headline = `${space.display_name} 인간 개입 기록이 실패했습니다.`;
          break;
        }
        steps.push({ step_id: `open_human_gate:${space.project_space_key}`, status: 'ok', evidence_ref: gateRes.gate?.id || null });
      }
    }

    // 5) cross-project isolation 점검
    let contaminated = false;
    const crossCheckSamples = [];
    for (const space of fixture.project_spaces) {
      const bindings = await listBindingsForSpace(space.project_space_key);
      crossCheckSamples.push({ key: space.project_space_key, n: bindings.length });
      for (const b of bindings) {
        if (b.project_space_key !== space.project_space_key) {
          contaminated = true;
        }
      }
    }
    steps.push({
      step_id: 'verify_cross_project_isolation',
      status: contaminated ? 'failed' : 'ok',
      note: `observed=${crossCheckSamples.map((s) => `${s.key}:${s.n}`).join(',')}`,
      failure_classification: contaminated
        ? {
            resolution_class: 'tenancy_or_binding_ambiguity',
            human_gate_reason: 'project_space 간 바인딩이 교차 유출되었습니다.',
            human_gate_action: 'binding insert 경로의 project_space_key 고정 여부를 점검해 주세요.',
          }
        : undefined,
    });
    if (contaminated) {
      breakLocation = 'project_space_binding';
      envelopeFailure = {
        resolution_class: 'tenancy_or_binding_ambiguity',
        human_gate_reason: 'project_space 간 바인딩이 교차 유출되었습니다.',
        human_gate_action: 'binding insert 경로의 project_space_key 고정 여부를 점검해 주세요.',
      };
      headline = '프로젝트 간 바인딩이 섞였습니다.';
    }

    // 6) open human gates 가 존재하면 broken 상태로 본다 (시나리오 1 은 다중 프로젝트 spinup 까지가 성공 기준)
    if (!envelopeFailure) {
      for (const space of fixture.project_spaces) {
        const openGates = await listOpenHumanGates(space.project_space_key);
        if (openGates.length > 0) {
          breakLocation = 'human_gate';
          const g = openGates[0];
          envelopeFailure = {
            resolution_class: mapGateKindToResolutionClass(g.gate_kind),
            human_gate_reason: typeof g.gate_reason === 'string' ? g.gate_reason : `${g.gate_kind} 대기 중`,
            human_gate_action: typeof g.gate_action === 'string' ? g.gate_action : null,
          };
          headline = `${space.display_name} 쪽에서 사람 개입이 필요합니다.`;
          break;
        }
      }
    }
  } catch (err) {
    breakLocation = 'unclassified';
    envelopeFailure = {
      resolution_class: 'runtime_bug_or_regression',
      human_gate_reason: err && err.message ? err.message : '알 수 없는 실행 오류',
      human_gate_action: '시나리오 러너 로그를 점검해 주세요.',
    };
    steps.push({
      step_id: 'runner_exception',
      status: 'failed',
      note: err && err.message ? err.message : 'unknown',
      failure_classification: envelopeFailure,
    });
    headline = '시나리오 러너가 예기치 못한 예외로 멈췄습니다.';
  }

  const finishedAt = now();
  const outcome = envelopeFailure ? 'broken' : 'succeeded';
  const buildRes = buildScenarioProofEnvelope({
    scenario_id: SCENARIO_ID,
    run_mode: runMode,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    outcome,
    break_location: outcome === 'succeeded' ? 'none' : breakLocation,
    steps,
    isolation: {
      project_space_keys_observed: Array.from(observedKeys),
      cross_project_contamination_detected: breakLocation === 'project_space_binding',
    },
    failure_classification: envelopeFailure,
    founder_surface_slice: { headline },
  });

  if (!buildRes.ok) {
    // 빌드 자체가 실패 → 시나리오는 inconclusive 로 유지(가짜 succeeded 금지)
    return buildScenarioProofEnvelope({
      scenario_id: SCENARIO_ID,
      run_mode: runMode,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      outcome: 'inconclusive',
      break_location: 'unclassified',
      founder_surface_slice: { headline: '시나리오 결과를 구조화하지 못했습니다.' },
      failure_classification: {
        resolution_class: 'runtime_bug_or_regression',
        human_gate_reason: `envelope build failed: ${buildRes.errors.join('; ')}`,
        human_gate_action: 'scenarioProofEnvelope 스키마 로그를 확인해 주세요.',
      },
    });
  }

  if (opts.writeToDisk) {
    writeEnvelopeToDisk(buildRes.envelope);
  }
  return buildRes;
}

function mapGateKindToResolutionClass(kind) {
  switch (kind) {
    case 'oauth_authorization':
      return 'hil_required_external_auth';
    case 'billing_or_subscription':
      return 'hil_required_subscription_or_billing';
    case 'policy_or_product_decision':
    case 'manual_secret_entry':
    case 'high_risk_approval':
      return 'hil_required_policy_or_product_decision';
    default:
      return 'hil_required_policy_or_product_decision';
  }
}

function defaultFixture() {
  return {
    project_spaces: [
      {
        project_space_key: 'scenario1_ps_alpha',
        display_name: 'Alpha 프로젝트',
        product_key: 'scenario1_alpha',
        spinup_run_id: 'scenario1_run_alpha',
        repo_ref: 'owner/alpha-repo',
        deploy_ref: 'railway:alpha-prod',
        db_ref: 'supabase:alpha',
      },
      {
        project_space_key: 'scenario1_ps_beta',
        display_name: 'Beta 프로젝트',
        product_key: 'scenario1_beta',
        spinup_run_id: 'scenario1_run_beta',
        repo_ref: 'owner/beta-repo',
        deploy_ref: 'vercel:beta-prod',
        db_ref: 'supabase:beta',
      },
    ],
  };
}

function writeEnvelopeToDisk(envelope) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(here, '..', '..', 'ops', 'scenario_runs');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = envelope.finished_at.replace(/[:.]/g, '-');
  const target = path.join(outDir, `${envelope.scenario_id}-${stamp}.json`);
  fs.writeFileSync(target, JSON.stringify(envelope, null, 2));
}

const isEntry = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isEntry) {
  const runMode = process.argv.includes('--live') ? 'live_openai' : 'fixture_replay';
  const writeToDisk = !process.argv.includes('--no-write');
  const fixtureArgIdx = process.argv.indexOf('--fixture');
  const fixturePath = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : null;
  const fixture = fixturePath ? JSON.parse(fs.readFileSync(path.resolve(fixturePath), 'utf8')) : undefined;
  runScenarioOne({ runMode, writeToDisk, fixture })
    .then((res) => {
      if (res.ok) {
        process.stdout.write(`${JSON.stringify(res.envelope, null, 2)}\n`);
        process.exit(0);
      }
      process.stderr.write(`scenario1 build failed: ${JSON.stringify(res.errors)}\n`);
      process.exit(2);
    })
    .catch((err) => {
      process.stderr.write(`scenario1 runner crashed: ${err?.message || err}\n`);
      process.exit(3);
    });
}
