#!/usr/bin/env node
/**
 * W6-A regression — scripts/scenario/run-scenario-2-research-to-bundle.mjs.
 *
 * 고정 케이스:
 *  1) 기본 fixture: research → draft → review → bundle 성공, deliverable.kind='bundle' + bundle_ref.
 *  2) bundle 단계 실패(bundle_ref 누락): outcome=broken, break_location=deliverable_bundle, deliverable null.
 *  3) 수동 제출 게이트 명시: outcome=broken, break_location=human_gate, deliverable 는 여전히 bundle 로 채워진다.
 *  4) fixture replay deterministic: 같은 fixture 두 번 돌리면 envelope 의 결정적 필드가 동일하다.
 *  5) missing stage: fixture 에서 stage 가 빠지면 workcell_runtime 에서 broken.
 */

import assert from 'node:assert/strict';

import { runScenarioTwo } from './scenario/run-scenario-2-research-to-bundle.mjs';

const fixedNow = () => new Date('2026-04-16T22:05:00Z');

// 1) 기본 fixture → succeeded + deliverable bundle
{
  const res = await runScenarioTwo({ writeToDisk: false, now: fixedNow });
  assert.equal(res.ok, true);
  const env = res.envelope;
  assert.equal(env.outcome, 'succeeded');
  assert.equal(env.break_location, 'none');
  assert.equal(env.deliverable.kind, 'bundle');
  assert.equal(env.deliverable.bundle_ref, 'ops/scenario_runs/scenario2_bundle.zip');
  assert.equal(env.failure_classification, null);
}

// 2) bundle 단계 bundle_ref 누락 → broken / deliverable_bundle
{
  const res = await runScenarioTwo({
    writeToDisk: false,
    now: fixedNow,
    fixture: {
      project_space_key: 'scenario2_ps_missing_bundle',
      stages: {
        research: { status: 'ok', sources: ['s1'], evidence_ref: 'r1' },
        draft: { status: 'ok', revisions: 1, evidence_ref: 'd1' },
        review: { status: 'ok', findings: 0, evidence_ref: 'v1' },
        bundle: { status: 'ok', bundle_ref: '' },
      },
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.envelope.outcome, 'broken');
  assert.equal(res.envelope.break_location, 'deliverable_bundle');
  assert.equal(res.envelope.deliverable.kind, null);
  assert.equal(res.envelope.deliverable.bundle_ref, null);
  assert.equal(res.envelope.failure_classification.resolution_class, 'runtime_bug_or_regression');
}

// 3) 수동 제출 게이트 → broken / human_gate, deliverable 는 남아 있다
{
  const res = await runScenarioTwo({
    writeToDisk: false,
    now: fixedNow,
    fixture: {
      project_space_key: 'scenario2_ps_manual_submit',
      stages: {
        research: { status: 'ok', sources: ['s1'], evidence_ref: 'r1' },
        draft: { status: 'ok', revisions: 1, evidence_ref: 'd1' },
        review: { status: 'ok', findings: 0, evidence_ref: 'v1' },
        bundle: {
          status: 'ok',
          bundle_ref: 'ops/scenario_runs/manual_submit_bundle.zip',
          manual_submission_gate: {
            reason: '규정상 수동 제출이 필요합니다.',
            action: '준비된 번들을 담당 포털에 업로드해 주세요.',
          },
        },
      },
    },
  });
  assert.equal(res.ok, true);
  const env = res.envelope;
  assert.equal(env.outcome, 'broken');
  assert.equal(env.break_location, 'human_gate');
  assert.equal(env.deliverable.kind, 'bundle');
  assert.equal(env.deliverable.bundle_ref, 'ops/scenario_runs/manual_submit_bundle.zip');
  assert.equal(env.failure_classification.resolution_class, 'hil_required_policy_or_product_decision');
  assert.equal(env.founder_surface_slice.human_gate_action, '준비된 번들을 담당 포털에 업로드해 주세요.');
  // 내부 jargon 금지
  assert.ok(!/resolution_class|project_space_key/.test(env.founder_surface_slice.headline));
}

// 4) fixture replay deterministic
{
  const fixture = {
    project_space_key: 'scenario2_ps_det',
    stages: {
      research: { status: 'ok', sources: ['a', 'b'], evidence_ref: 'r' },
      draft: { status: 'ok', revisions: 3, evidence_ref: 'd' },
      review: { status: 'ok', findings: 1, evidence_ref: 'v' },
      bundle: { status: 'ok', bundle_ref: 'ops/scenario_runs/det.zip' },
    },
  };
  const a = await runScenarioTwo({ writeToDisk: false, now: fixedNow, fixture });
  const b = await runScenarioTwo({ writeToDisk: false, now: fixedNow, fixture });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  // 결정성 비교 — 시간·입력이 같으면 전체 envelope 문자열이 동일해야 한다.
  assert.equal(JSON.stringify(a.envelope), JSON.stringify(b.envelope), 'fixture replay must be deterministic');
}

// 5) missing stage → broken / workcell_runtime
{
  const res = await runScenarioTwo({
    writeToDisk: false,
    now: fixedNow,
    fixture: {
      project_space_key: 'scenario2_ps_missing_stage',
      stages: {
        research: { status: 'ok', sources: ['s1'] },
        // draft 누락
        review: { status: 'ok', findings: 0 },
        bundle: { status: 'ok', bundle_ref: 'ops/scenario_runs/x.zip' },
      },
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.envelope.outcome, 'broken');
  assert.equal(res.envelope.break_location, 'workcell_runtime');
  assert.equal(res.envelope.failure_classification.resolution_class, 'model_coordination_failure');
}

console.log('test-scenario-2-research-to-bundle: ok');
