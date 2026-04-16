#!/usr/bin/env node
/**
 * W6-A Scenario 2 runner — research → document → review → bundle proof harness.
 *
 * 목적(W5-W7 §10 Scenario 2): 연구 아티팩트가 캡처되고, 초안이 진화하고, 리뷰가 실제로 일어나고,
 * 번들이 1급 deliverable 객체로 founder 에게 전달된다 — 수동 제출 게이트가 필요하면 명시된다.
 *
 * 운영 원칙:
 *  - Fixture replay 가 기본. 동일 fixture + 동일 clock 입력이면 동일 envelope 이 나와야 한다(deterministic).
 *  - live OpenAI 경로는 COS_SCENARIO_LIVE_OPENAI=1 게이트(스캐폴드는 아직 inconclusive 로 종료).
 *  - 실제 파일/번들을 만들지 않는다. bundle_ref 는 논리적 경로만 사용(테스트에서 값 비교).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildScenarioProofEnvelope } from './scenarioProofEnvelope.js';

const SCENARIO_ID = 'scenario_2_research_to_bundle';

const STAGE_ORDER = Object.freeze(['research', 'draft', 'review', 'bundle']);

/**
 * @param {{
 *   runMode?: 'fixture_replay' | 'live_openai',
 *   fixture?: object,
 *   writeToDisk?: boolean,
 *   now?: () => Date,
 * }} [opts]
 */
export async function runScenarioTwo(opts = {}) {
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

  const fixture = normalizeFixture(opts.fixture || defaultFixture());

  /** @type {Array<{step_id:string,status:string,note?:string,evidence_ref?:string,failure_classification?:object}>} */
  const steps = [];
  let breakLocation = 'none';
  let envelopeFailure = null;
  let headline = '연구 → 초안 → 리뷰 → 번들 제출까지 마쳤습니다.';
  let deliverable = { kind: null, bundle_ref: null };
  let researchCount = 0;
  let reviewFindings = 0;

  for (const stageName of STAGE_ORDER) {
    const stage = fixture.stages[stageName];
    if (!stage) {
      steps.push({
        step_id: `${stageName}:missing_fixture`,
        status: 'failed',
        failure_classification: {
          resolution_class: 'model_coordination_failure',
          human_gate_reason: `scenario 2 fixture 에 ${stageName} 단계가 없습니다.`,
        },
      });
      breakLocation = 'workcell_runtime';
      envelopeFailure = {
        resolution_class: 'model_coordination_failure',
        human_gate_reason: `scenario 2 fixture 에 ${stageName} 단계가 없습니다.`,
        human_gate_action: 'fixture 를 고쳐 네 단계를 모두 제공해 주세요.',
      };
      headline = `${stageName} 단계 fixture 가 비어 있습니다.`;
      break;
    }

    if (stage.status === 'blocked' || stage.status === 'failed') {
      steps.push({
        step_id: `${stageName}:${stage.status}`,
        status: stage.status,
        note: stage.note || null,
        evidence_ref: stage.evidence_ref || null,
        failure_classification: stage.failure_classification || {
          resolution_class: 'model_coordination_failure',
          human_gate_reason: stage.note || `${stageName} 단계가 ${stage.status} 상태입니다.`,
        },
      });
      breakLocation = stageName === 'bundle' ? 'deliverable_bundle' : 'workcell_runtime';
      envelopeFailure = stage.failure_classification || {
        resolution_class: 'model_coordination_failure',
        human_gate_reason: stage.note || `${stageName} 단계가 ${stage.status} 상태입니다.`,
        human_gate_action: stageName === 'bundle'
          ? '번들 산출물을 다시 조립해 주세요.'
          : `${stageName} 단계를 다시 시도해 주세요.`,
      };
      headline = `${stageName} 단계에서 멈췄습니다.`;
      break;
    }

    if (stageName === 'research') {
      researchCount = Array.isArray(stage.sources) ? stage.sources.length : 0;
      steps.push({
        step_id: 'research:capture',
        status: 'ok',
        note: `sources=${researchCount}`,
        evidence_ref: stage.evidence_ref || null,
      });
    } else if (stageName === 'draft') {
      const revisions = Number.isFinite(stage.revisions) ? stage.revisions : 1;
      steps.push({
        step_id: 'draft:evolve',
        status: 'ok',
        note: `revisions=${revisions}`,
        evidence_ref: stage.evidence_ref || null,
      });
    } else if (stageName === 'review') {
      reviewFindings = Number.isFinite(stage.findings) ? stage.findings : 0;
      steps.push({
        step_id: 'review:apply',
        status: 'ok',
        note: `findings=${reviewFindings}`,
        evidence_ref: stage.evidence_ref || null,
      });
    } else if (stageName === 'bundle') {
      const bundleRef = typeof stage.bundle_ref === 'string' && stage.bundle_ref.trim() ? stage.bundle_ref.trim() : null;
      if (!bundleRef) {
        steps.push({
          step_id: 'bundle:assemble',
          status: 'failed',
          note: 'bundle_ref_missing',
          failure_classification: {
            resolution_class: 'runtime_bug_or_regression',
            human_gate_reason: '번들 경로가 비어 있습니다.',
            human_gate_action: '번들 조립 단계를 다시 확인해 주세요.',
          },
        });
        breakLocation = 'deliverable_bundle';
        envelopeFailure = {
          resolution_class: 'runtime_bug_or_regression',
          human_gate_reason: '번들 경로가 비어 있습니다.',
          human_gate_action: '번들 조립 단계를 다시 확인해 주세요.',
        };
        headline = '번들 산출물이 누락되었습니다.';
        break;
      }
      deliverable = { kind: 'bundle', bundle_ref: bundleRef };
      steps.push({
        step_id: 'bundle:assemble',
        status: 'ok',
        note: `bundle_ref=${bundleRef}`,
        evidence_ref: bundleRef,
      });

      if (stage.manual_submission_gate) {
        const gate = stage.manual_submission_gate;
        steps.push({
          step_id: 'bundle:manual_submission_gate',
          status: 'blocked',
          note: gate.reason || '수동 제출이 필요합니다.',
          failure_classification: {
            resolution_class: 'hil_required_policy_or_product_decision',
            human_gate_reason: gate.reason || '수동 제출이 필요합니다.',
            human_gate_action: gate.action || '번들을 수동으로 제출해 주세요.',
          },
        });
        breakLocation = 'human_gate';
        envelopeFailure = {
          resolution_class: 'hil_required_policy_or_product_decision',
          human_gate_reason: gate.reason || '수동 제출이 필요합니다.',
          human_gate_action: gate.action || '번들을 수동으로 제출해 주세요.',
        };
        headline = '번들은 준비됐지만 수동 제출이 남아 있습니다.';
      }
    }
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
      project_space_keys_observed: fixture.project_space_key ? [fixture.project_space_key] : [],
      cross_project_contamination_detected: false,
    },
    deliverable,
    failure_classification: envelopeFailure,
    founder_surface_slice: { headline },
  });

  if (!buildRes.ok) {
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

  if (opts.writeToDisk) writeEnvelopeToDisk(buildRes.envelope);
  return buildRes;
}

function defaultFixture() {
  return {
    project_space_key: 'scenario2_ps_research',
    stages: {
      research: {
        status: 'ok',
        sources: ['source:primer_a', 'source:primer_b', 'source:primer_c'],
        evidence_ref: 'research_notes_v1',
      },
      draft: { status: 'ok', revisions: 2, evidence_ref: 'draft_v2' },
      review: { status: 'ok', findings: 0, evidence_ref: 'review_v1' },
      bundle: { status: 'ok', bundle_ref: 'ops/scenario_runs/scenario2_bundle.zip' },
    },
  };
}

function normalizeFixture(f) {
  if (!f || typeof f !== 'object') return defaultFixture();
  const stages = f.stages && typeof f.stages === 'object' ? f.stages : {};
  return {
    project_space_key: typeof f.project_space_key === 'string' ? f.project_space_key : null,
    stages,
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
  runScenarioTwo({ runMode, writeToDisk })
    .then((res) => {
      if (res.ok) {
        process.stdout.write(`${JSON.stringify(res.envelope, null, 2)}\n`);
        process.exit(0);
      }
      process.stderr.write(`scenario2 build failed: ${JSON.stringify(res.errors)}\n`);
      process.exit(2);
    })
    .catch((err) => {
      process.stderr.write(`scenario2 runner crashed: ${err?.message || err}\n`);
      process.exit(3);
    });
}
