/**
 * W5-B — project-space binding lane (internal only; not an OpenAI tool).
 *
 * COS 내부 판단이 project_space binding graph 와 human_gate 를 갱신할 때 이 레인을 통해
 * 경유한다. OpenAI tool-call 열람 대상(ALLOWED_EXTERNAL_TOOLS)에는 포함하지 않는다 —
 * 테넄시 truth 는 외부 호출자가 임의로 갱신할 수 없도록 fail-closed.
 *
 * 금지사항(헌법 §2/§6, W5-W7 Track B):
 *   1) env 값(secret) 저장 금지 — env_requirement binding_ref 는 NAME 만 허용.
 *   2) free-form binding_ref 에 '=' 또는 'SECRET'/'TOKEN' 패턴 + 실제 값(길이 heuristic) 차단.
 *   3) project_space 상단 키는 반드시 존재해야 하며 empty fallback 금지(fail-closed).
 */

import { buildFailureClassification } from '../../failureTaxonomy.js';
import {
  PROJECT_SPACE_BINDING_KINDS,
  PROJECT_SPACE_GATE_KINDS,
  getProjectSpace,
  upsertProjectSpace,
  recordBinding,
  listBindingsForSpace,
  openHumanGate,
  closeHumanGate,
  listOpenHumanGates,
} from '../../projectSpaceBindingStore.js';

export const PROJECT_SPACE_ACTIONS = Object.freeze([
  'bind_repo',
  'bind_deploy',
  'bind_db',
  'declare_env_requirement',
  'open_human_gate',
  'close_human_gate',
  'plan_propagation',
  'execute_propagation_dry_run',
  'open_resumable_gate',
  'close_and_resume_gate',
]);

const ACTION_TO_BINDING_KIND = Object.freeze({
  bind_repo: 'repo_binding',
  bind_deploy: 'deploy_binding',
  bind_db: 'db_binding',
  declare_env_requirement: 'env_requirement',
});

/** Heuristic: looks like a concrete secret value (not an env var NAME). */
const SECRET_VALUE_SHAPES = [
  /[A-Za-z0-9_\-]{40,}/,
  /^eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/, // jwt-ish
  /https?:\/\//i,
  /=/, // KEY=VALUE form
];

const ENV_NAME_SHAPE = /^[A-Z][A-Z0-9_]{1,47}$/;

const AWS_ACCESS_KEY_SHAPE = /^(AKIA|ASIA)[A-Z0-9]{12,}$/;

function trimString(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * env 값 저장 금지 guard — declare_env_requirement 의 binding_ref 는 env NAME 이어야 한다.
 * 값이 의심되는 경우 문자열 reason 반환, 안전하면 null 반환.
 * @param {string} bindingRef
 * @returns {string | null}
 */
export function detectEnvValueLeak(bindingRef) {
  const ref = trimString(bindingRef);
  if (!ref) return 'env_requirement.binding_ref 가 비어 있습니다';
  if (AWS_ACCESS_KEY_SHAPE.test(ref)) {
    return 'env_requirement.binding_ref 에는 값 대신 환경변수 NAME 만 기록하세요';
  }
  if (!ENV_NAME_SHAPE.test(ref)) {
    if (/\s/.test(ref)) return 'env_requirement.binding_ref 에 공백이 포함되면 안 됩니다(NAME 만 허용)';
    for (const pat of SECRET_VALUE_SHAPES) {
      if (pat.test(ref)) return 'env_requirement.binding_ref 에는 값 대신 환경변수 NAME 만 기록하세요';
    }
    return 'env_requirement.binding_ref 는 대문자 + 숫자/언더스코어로만 구성된 48자 이하 NAME 이어야 합니다';
  }
  return null;
}

/**
 * 각 action 별 precheck — W5-A classifier 로 실패분류를 붙여 반환한다.
 *
 * @param {string} action
 * @param {Record<string, unknown>} payload
 */
export function projectSpaceInvocationPrecheck(action, payload) {
  const act = trimString(action);
  const pl = payload && typeof payload === 'object' ? payload : {};
  if (!PROJECT_SPACE_ACTIONS.includes(act)) {
    return {
      blocked: true,
      blocked_reason: `unknown project_space action: ${act || '(empty)'}`,
      next_required_input: 'action',
      failure_classification: buildFailureClassification({
        resolution_class: 'model_coordination_failure',
        human_gate_reason: `알 수 없는 project_space action: ${act}`,
      }),
    };
  }
  const psKey = trimString(pl.project_space_key);
  const exemptPsKey = act === 'close_human_gate' || act === 'close_and_resume_gate';
  if (!psKey && !exemptPsKey) {
    return {
      blocked: true,
      blocked_reason: 'project_space_key required',
      next_required_input: 'project_space_key',
      failure_classification: buildFailureClassification({
        resolution_class: 'tenancy_or_binding_ambiguity',
        human_gate_reason: '어느 프로젝트 공간을 가리키는지 명시되지 않았습니다.',
      }),
    };
  }

  if (ACTION_TO_BINDING_KIND[act]) {
    const ref = trimString(pl.binding_ref);
    if (!ref) {
      return {
        blocked: true,
        blocked_reason: `${act} requires binding_ref`,
        next_required_input: 'binding_ref',
        failure_classification: buildFailureClassification({
          resolution_class: 'model_coordination_failure',
          human_gate_reason: `${act} 에 binding_ref 가 필요합니다.`,
        }),
      };
    }
    if (act === 'declare_env_requirement') {
      const leak = detectEnvValueLeak(ref);
      if (leak) {
        return {
          blocked: true,
          blocked_reason: leak,
          next_required_input: 'binding_ref',
          failure_classification: buildFailureClassification({
            resolution_class: 'model_coordination_failure',
            human_gate_reason: leak,
            human_gate_action: 'binding_ref 에는 환경변수 값 대신 NAME 만 기록해 주세요.',
          }),
        };
      }
    }
    return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
  }

  if (act === 'open_human_gate' || act === 'open_resumable_gate') {
    const kind = trimString(pl.gate_kind);
    if (!PROJECT_SPACE_GATE_KINDS.includes(kind)) {
      return {
        blocked: true,
        blocked_reason: `unknown gate_kind: ${kind || '(empty)'}`,
        next_required_input: 'gate_kind',
        failure_classification: buildFailureClassification({
          resolution_class: 'model_coordination_failure',
          human_gate_reason: `gate_kind 가 유효하지 않습니다: ${kind}`,
        }),
      };
    }
    return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
  }

  if (act === 'plan_propagation' || act === 'execute_propagation_dry_run') {
    // requirements 는 opts 로 전달되므로 payload 는 project_space_key 만 필수.
    return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
  }

  if (act === 'close_and_resume_gate') {
    const id = trimString(pl.id);
    if (!id) {
      return {
        blocked: true,
        blocked_reason: 'close_and_resume_gate requires id',
        next_required_input: 'id',
        failure_classification: buildFailureClassification({
          resolution_class: 'model_coordination_failure',
          human_gate_reason: 'close_and_resume_gate 에 gate id 가 필요합니다.',
        }),
      };
    }
    return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
  }

  // close_human_gate
  const id = trimString(pl.id);
  if (!id) {
    return {
      blocked: true,
      blocked_reason: 'close_human_gate requires id',
      next_required_input: 'id',
      failure_classification: buildFailureClassification({
        resolution_class: 'model_coordination_failure',
        human_gate_reason: 'close_human_gate 에 gate id 가 필요합니다.',
      }),
    };
  }
  const status = trimString(pl.gate_status) || 'resolved';
  if (status !== 'resolved' && status !== 'abandoned') {
    return {
      blocked: true,
      blocked_reason: `close_human_gate.gate_status must be resolved|abandoned (got ${status})`,
      next_required_input: 'gate_status',
      failure_classification: buildFailureClassification({
        resolution_class: 'model_coordination_failure',
        human_gate_reason: `close_human_gate.gate_status 가 잘못되었습니다: ${status}`,
      }),
    };
  }
  return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
}

/**
 * action 실행 — precheck 를 내부적으로 먼저 호출하고, 통과 시 store 로 위임한다.
 *
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @param {{
 *   display_name?: string,
 *   workspace_key?: string,
 *   product_key?: string,
 *   parcel_deployment_key?: string,
 *   evidence_run_id?: string,
 *   opened_by_run_id?: string,
 *   closed_by_run_id?: string,
 *   gate_reason?: string,
 *   gate_action?: string,
 * }} [opts]
 */
export async function applyProjectSpaceAction(action, payload, opts = {}) {
  const pre = projectSpaceInvocationPrecheck(action, payload);
  if (pre.blocked) {
    return { ok: false, ...pre };
  }
  const pl = payload || {};
  const psKey = trimString(pl.project_space_key);

  if (ACTION_TO_BINDING_KIND[action]) {
    const existing = await getProjectSpace(psKey);
    if (!existing) {
      await upsertProjectSpace({
        project_space_key: psKey,
        display_name: opts.display_name || null,
        workspace_key: opts.workspace_key || null,
        product_key: opts.product_key || null,
        parcel_deployment_key: opts.parcel_deployment_key || null,
      });
    }
    const row = await recordBinding({
      project_space_key: psKey,
      binding_kind: ACTION_TO_BINDING_KIND[action],
      binding_ref: trimString(pl.binding_ref),
      evidence_run_id: opts.evidence_run_id || null,
      workspace_key: opts.workspace_key || existing?.workspace_key || null,
      product_key: opts.product_key || existing?.product_key || null,
      parcel_deployment_key: opts.parcel_deployment_key || existing?.parcel_deployment_key || null,
    });
    return { ok: true, blocked: false, binding: row };
  }

  if (action === 'open_human_gate') {
    const existing = await getProjectSpace(psKey);
    if (!existing) {
      await upsertProjectSpace({
        project_space_key: psKey,
        display_name: opts.display_name || null,
        workspace_key: opts.workspace_key || null,
        product_key: opts.product_key || null,
        parcel_deployment_key: opts.parcel_deployment_key || null,
      });
    }
    const row = await openHumanGate({
      project_space_key: psKey,
      gate_kind: trimString(pl.gate_kind),
      gate_reason: opts.gate_reason || (pl.gate_reason != null ? String(pl.gate_reason) : null),
      gate_action: opts.gate_action || (pl.gate_action != null ? String(pl.gate_action) : null),
      opened_by_run_id: opts.opened_by_run_id || null,
      workspace_key: opts.workspace_key || existing?.workspace_key || null,
      product_key: opts.product_key || existing?.product_key || null,
      parcel_deployment_key: opts.parcel_deployment_key || existing?.parcel_deployment_key || null,
    });
    return { ok: true, blocked: false, gate: row };
  }

  if (action === 'open_resumable_gate') {
    const { openResumableGate } = await import('../../humanGateRuntime.js');
    const existing = await getProjectSpace(psKey);
    if (!existing) {
      await upsertProjectSpace({
        project_space_key: psKey,
        display_name: opts.display_name || null,
        workspace_key: opts.workspace_key || null,
        product_key: opts.product_key || null,
        parcel_deployment_key: opts.parcel_deployment_key || null,
      });
    }
    const row = await openResumableGate({
      project_space_key: psKey,
      gate_kind: trimString(pl.gate_kind),
      gate_reason: opts.gate_reason || (pl.gate_reason != null ? String(pl.gate_reason) : null),
      gate_action: opts.gate_action || (pl.gate_action != null ? String(pl.gate_action) : null),
      opened_by_run_id: opts.opened_by_run_id || null,
      workspace_key: opts.workspace_key || existing?.workspace_key || null,
      product_key: opts.product_key || existing?.product_key || null,
      parcel_deployment_key: opts.parcel_deployment_key || existing?.parcel_deployment_key || null,
      continuation_packet_id: opts.continuation_packet_id || pl.continuation_packet_id || null,
      continuation_run_id: opts.continuation_run_id || pl.continuation_run_id || null,
      continuation_thread_key: opts.continuation_thread_key || pl.continuation_thread_key || null,
      required_human_action:
        opts.required_human_action || (pl.required_human_action != null ? String(pl.required_human_action) : null),
    });
    return { ok: true, blocked: false, gate: row };
  }

  if (action === 'close_and_resume_gate') {
    const { closeGateAndResume } = await import('../../humanGateRuntime.js');
    const result = await closeGateAndResume({
      id: trimString(pl.id),
      gate_status: trimString(pl.gate_status) || 'resolved',
      closed_by_run_id: opts.closed_by_run_id || null,
    });
    return { ok: true, blocked: false, gate: result.gate, continuation: result.continuation };
  }

  if (action === 'plan_propagation') {
    const { buildPropagationPlan } = await import('../../envSecretPropagationPlan.js');
    const plan = buildPropagationPlan({
      project_space_key: psKey,
      requirements: Array.isArray(opts.requirements) ? opts.requirements : [],
      existingBindings: Array.isArray(opts.existingBindings) ? opts.existingBindings : [],
      sinkCapabilities: opts.sinkCapabilities || {},
    });
    return { ok: true, blocked: false, plan };
  }

  if (action === 'execute_propagation_dry_run') {
    const { buildPropagationPlan } = await import('../../envSecretPropagationPlan.js');
    const { executePropagationPlan } = await import('../../envSecretPropagationEngine.js');
    const plan =
      opts.plan ||
      buildPropagationPlan({
        project_space_key: psKey,
        requirements: Array.isArray(opts.requirements) ? opts.requirements : [],
        existingBindings: Array.isArray(opts.existingBindings) ? opts.existingBindings : [],
        sinkCapabilities: opts.sinkCapabilities || {},
      });
    const result = await executePropagationPlan({
      plan,
      dry_run: opts.dry_run !== false,
      writers: opts.writers || {},
      tenancy: {
        workspace_key: opts.workspace_key || null,
        product_key: opts.product_key || null,
        parcel_deployment_key: opts.parcel_deployment_key || null,
      },
    });
    return { ok: true, blocked: false, plan, propagation: result };
  }

  // close_human_gate
  const row = await closeHumanGate({
    id: trimString(pl.id),
    gate_status: trimString(pl.gate_status) || 'resolved',
    closed_by_run_id: opts.closed_by_run_id || null,
  });
  return { ok: true, blocked: false, gate: row };
}

/** Re-export for callers that want to render the compact slice. */
export { listBindingsForSpace, listOpenHumanGates, PROJECT_SPACE_BINDING_KINDS, PROJECT_SPACE_GATE_KINDS };
