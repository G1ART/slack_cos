/**
 * W6-A Scenario proof envelope — SSOT (Track C).
 *
 * 시나리오 하니스가 산출하는 구조화된 증거 봉투의 유일한 스키마·검증·직렬화 지점.
 * 헌법 §2(가짜 live 금지)·§6(founder 에 내부 jargon 금지)·W5-A failure taxonomy 에 정렬된다.
 *
 * 설계 원칙:
 *  - 시나리오 러너(scripts/scenario/run-scenario-*.mjs)가 이 모듈만 써서 envelope 을 쌓는다.
 *  - envelope 자체는 감사 산출물이며 founder 본문에 통째로 들어가지 않는다 (compact slice 만 허용).
 *  - 실패/보류는 반드시 W5-A `failureTaxonomy.buildFailureClassification` 으로 분류된다.
 *  - live=false 일 때도 본질적인 cross-project isolation·break location 증거는 기록된다.
 *
 * 본 모듈은 pure: 외부 store·fetch 를 직접 호출하지 않는다.
 */

import {
  buildFailureClassification,
  isKnownResolutionClass,
} from '../../src/founder/failureTaxonomy.js';

export const SCENARIO_PROOF_ENVELOPE_SCHEMA_VERSION = 1;

/** 시나리오 고정 슬러그 (Track C, W6-A). */
export const SCENARIO_IDS = Object.freeze([
  'scenario_1_multi_project_spinup',
  'scenario_2_research_to_bundle',
]);

/** envelope 상단 outcome — 중립적 3값, 가짜 완료 금지 */
export const SCENARIO_OUTCOMES = Object.freeze(['succeeded', 'broken', 'inconclusive']);

/**
 * break_location 은 "어디에서 멈췄는가" 의 고정 카테고리.
 * 시나리오 러너는 이 값 중 하나로만 분류해야 한다 (자유 문자열 금지).
 */
export const BREAK_LOCATIONS = Object.freeze([
  'none',
  'project_space_binding',
  'repo_binding',
  'deploy_binding',
  'db_binding',
  'env_requirement',
  'tool_dispatch',
  'callback_closure',
  'workcell_runtime',
  'deliverable_bundle',
  'human_gate',
  'unclassified',
]);

/** 실행 모드 — fixture replay 기본, live OpenAI 는 게이트된 별도 모드. */
export const SCENARIO_RUN_MODES = Object.freeze(['fixture_replay', 'live_openai']);

const OUTCOME_SET = new Set(SCENARIO_OUTCOMES);
const BREAK_SET = new Set(BREAK_LOCATIONS);
const MODE_SET = new Set(SCENARIO_RUN_MODES);
const SCENARIO_SET = new Set(SCENARIO_IDS);

/**
 * @typedef {object} ScenarioStep
 * @property {string} step_id         - 짧은 식별자 (예: "open_project_space", "bind_repo")
 * @property {'ok' | 'blocked' | 'failed' | 'skipped'} status
 * @property {string | null} [note]    - 자유 텍스트 짧은 메모 (사람용)
 * @property {string | null} [evidence_ref] - run_id / binding_ref 등 추적용 참조 (값이 아니라 이름)
 * @property {object | null} [failure_classification] - W5-A 결과(빈 객체 허용)
 */

/**
 * @typedef {object} ScenarioProofEnvelope
 * @property {number} schema_version
 * @property {string} scenario_id
 * @property {string} run_mode
 * @property {string} started_at       - ISO8601 UTC
 * @property {string} finished_at      - ISO8601 UTC
 * @property {string} outcome          - 'succeeded' | 'broken' | 'inconclusive'
 * @property {string} break_location
 * @property {ScenarioStep[]} steps
 * @property {object} isolation        - cross-project isolation evidence
 * @property {string[]} isolation.project_space_keys_observed
 * @property {boolean} isolation.cross_project_contamination_detected
 * @property {object} deliverable      - 산출물 증거 (scenario 2 에서 주로 채움)
 * @property {string | null} deliverable.kind   - 'bundle' | 'document' | null
 * @property {string | null} deliverable.bundle_ref - 파일/경로 참조 (값 아님)
 * @property {object | null} failure_classification - envelope 전체 실패 분류(W5-A)
 * @property {object} founder_surface_slice - founder 에 노출 가능한 sanitized 요약
 */

/**
 * Build + validate envelope. 검증 실패 시 예외 대신 명시적 오류 객체를 반환한다.
 * @param {object} input
 * @returns {{ ok: true, envelope: ScenarioProofEnvelope } | { ok: false, errors: string[] }}
 */
export function buildScenarioProofEnvelope(input = {}) {
  const errors = [];
  const scenario_id = typeof input.scenario_id === 'string' ? input.scenario_id : null;
  if (!scenario_id || !SCENARIO_SET.has(scenario_id)) {
    errors.push(`scenario_id_must_be_one_of:${SCENARIO_IDS.join('|')}`);
  }
  const run_mode = typeof input.run_mode === 'string' ? input.run_mode : 'fixture_replay';
  if (!MODE_SET.has(run_mode)) errors.push(`run_mode_must_be_one_of:${SCENARIO_RUN_MODES.join('|')}`);

  const outcome = typeof input.outcome === 'string' ? input.outcome : null;
  if (!outcome || !OUTCOME_SET.has(outcome)) {
    errors.push(`outcome_must_be_one_of:${SCENARIO_OUTCOMES.join('|')}`);
  }
  const break_location = typeof input.break_location === 'string' ? input.break_location : 'none';
  if (!BREAK_SET.has(break_location)) errors.push(`break_location_must_be_one_of:${BREAK_LOCATIONS.join('|')}`);

  if (outcome === 'succeeded' && break_location !== 'none') {
    errors.push('succeeded_outcome_requires_break_location_none');
  }
  if (outcome === 'broken' && break_location === 'none') {
    errors.push('broken_outcome_must_have_break_location');
  }

  const started_at = normalizeIso(input.started_at);
  const finished_at = normalizeIso(input.finished_at);
  if (!started_at) errors.push('started_at_must_be_iso8601');
  if (!finished_at) errors.push('finished_at_must_be_iso8601');

  const stepsRaw = Array.isArray(input.steps) ? input.steps : [];
  const steps = stepsRaw.map((s, idx) => validateStep(s, idx, errors));

  const isolationInput = input.isolation && typeof input.isolation === 'object' ? input.isolation : {};
  const observed = Array.isArray(isolationInput.project_space_keys_observed)
    ? isolationInput.project_space_keys_observed.filter((k) => typeof k === 'string' && k.trim())
    : [];
  const dupFound = observed.length !== new Set(observed).size
    ? false
    : false;
  void dupFound;
  const isolation = {
    project_space_keys_observed: Array.from(new Set(observed)),
    cross_project_contamination_detected:
      typeof isolationInput.cross_project_contamination_detected === 'boolean'
        ? isolationInput.cross_project_contamination_detected
        : false,
  };

  const deliverableInput = input.deliverable && typeof input.deliverable === 'object' ? input.deliverable : {};
  const deliverable = {
    kind: typeof deliverableInput.kind === 'string' && deliverableInput.kind ? deliverableInput.kind : null,
    bundle_ref: typeof deliverableInput.bundle_ref === 'string' && deliverableInput.bundle_ref
      ? deliverableInput.bundle_ref
      : null,
  };

  let failure_classification = null;
  if (outcome !== 'succeeded') {
    const fc = input.failure_classification && typeof input.failure_classification === 'object'
      ? input.failure_classification
      : {};
    if (fc.resolution_class && !isKnownResolutionClass(fc.resolution_class)) {
      errors.push(`failure_classification.resolution_class_unknown:${fc.resolution_class}`);
    }
    failure_classification = buildFailureClassification(fc);
    if (outcome === 'broken' && !failure_classification.resolution_class) {
      errors.push('broken_outcome_requires_resolution_class');
    }
  }

  const founderSurfaceInput = input.founder_surface_slice && typeof input.founder_surface_slice === 'object'
    ? input.founder_surface_slice
    : {};
  const founder_surface_slice = {
    intent: typeof founderSurfaceInput.intent === 'string' ? founderSurfaceInput.intent : outcome,
    headline: typeof founderSurfaceInput.headline === 'string' ? founderSurfaceInput.headline.trim() : '',
    human_gate_action:
      failure_classification && failure_classification.human_gate_action
        ? failure_classification.human_gate_action
        : null,
  };
  if (containsInternalJargon(founder_surface_slice.headline)) {
    errors.push('founder_surface_slice.headline_must_not_contain_internal_jargon');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    envelope: {
      schema_version: SCENARIO_PROOF_ENVELOPE_SCHEMA_VERSION,
      scenario_id,
      run_mode,
      started_at,
      finished_at,
      outcome,
      break_location,
      steps,
      isolation,
      deliverable,
      failure_classification,
      founder_surface_slice,
    },
  };
}

/**
 * Compact founder-facing lines for read_execution_context slices. 내부 토큰 금지.
 * @param {ScenarioProofEnvelope} env
 * @returns {string[]}
 */
export function toFounderCompactLines(env) {
  if (!env || typeof env !== 'object') return [];
  const out = [];
  const sid = env.scenario_id ? env.scenario_id.replace(/_/g, ' ') : 'scenario';
  const headline = env.founder_surface_slice && env.founder_surface_slice.headline
    ? env.founder_surface_slice.headline
    : '';
  if (headline) out.push(`${sid} · ${headline}`);
  else out.push(`${sid} · ${env.outcome || ''}`.trim());
  if (env.founder_surface_slice && env.founder_surface_slice.human_gate_action) {
    out.push(`다음 조치: ${env.founder_surface_slice.human_gate_action}`);
  }
  return out.filter((line) => typeof line === 'string' && line.trim());
}

function validateStep(s, idx, errors) {
  const step_id = s && typeof s.step_id === 'string' ? s.step_id : null;
  if (!step_id) errors.push(`steps[${idx}].step_id_must_be_non_empty_string`);
  const status = s && typeof s.status === 'string' ? s.status : null;
  if (!['ok', 'blocked', 'failed', 'skipped'].includes(status)) {
    errors.push(`steps[${idx}].status_must_be_one_of:ok|blocked|failed|skipped`);
  }
  const note = s && typeof s.note === 'string' ? s.note.trim() : null;
  const evidence_ref = s && typeof s.evidence_ref === 'string' ? s.evidence_ref.trim() : null;
  let failure_classification = null;
  if (status === 'blocked' || status === 'failed') {
    const fc = s && s.failure_classification && typeof s.failure_classification === 'object'
      ? s.failure_classification
      : {};
    if (fc.resolution_class && !isKnownResolutionClass(fc.resolution_class)) {
      errors.push(`steps[${idx}].failure_classification.resolution_class_unknown:${fc.resolution_class}`);
    }
    failure_classification = buildFailureClassification(fc);
  }
  return {
    step_id,
    status,
    note: note || null,
    evidence_ref: evidence_ref || null,
    failure_classification,
  };
}

function normalizeIso(v) {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const INTERNAL_JARGON_PATTERNS = [
  /resolution_class/i,
  /\bhuman_gate_required\b/i,
  /workcell_runtime/i,
  /parcel_deployment_key/i,
  /project_space_key/i,
  /\bbinding_kind\b/i,
];

function containsInternalJargon(s) {
  if (typeof s !== 'string' || !s) return false;
  return INTERNAL_JARGON_PATTERNS.some((r) => r.test(s));
}
