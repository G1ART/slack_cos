/**
 * COS Constitution v1.1 — Packet Assembler.
 * Sits between executor and renderer: assembles executor results into
 * founder-facing operational packets with work state, evidence, next actions.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_PACKET_ASSEMBLER

import { WorkPhase } from './founderContracts.js';

/**
 * @typedef {Object} FounderPacket
 * @property {string} packet_type — e.g. 'execution', 'approval', 'deploy', 'status', 'discovery', 'utility'
 * @property {{ type: string, id: string|null }} work_ref
 * @property {string|null} founder_action_required
 * @property {string[]} evidence_refs
 * @property {string[]} next_actions
 * @property {string} [text] — pre-rendered text from executor (passthrough for utility/legacy)
 * @property {object[]} [blocks] — Slack blocks (passthrough)
 * @property {Record<string, unknown>} [extra] — additional fields for renderer
 */

/**
 * Assemble executor result into a founder-facing packet.
 * @param {Record<string, unknown>} executorResult — raw executor output
 * @param {import('./workObjectResolver.js').WorkContext} workContext
 * @param {{ phase: string }} phaseResult
 * @returns {FounderPacket}
 */
export function assemblePacket(executorResult, workContext, phaseResult) {
  if (!executorResult) {
    return makeUtilityPacket({ text: null }, workContext);
  }

  if (executorResult.packet && typeof executorResult.packet === 'object') {
    return {
      ...executorResult.packet,
      work_ref: workRef(workContext),
      text: executorResult.text,
      blocks: executorResult.blocks,
    };
  }

  const phase = phaseResult?.phase || WorkPhase.DISCOVER;

  switch (phase) {
    case WorkPhase.DISCOVER:
      return makeDiscoveryPacket(executorResult, workContext);

    case WorkPhase.ALIGN:
      return makeAlignPacket(executorResult, workContext);

    case WorkPhase.LOCK:
    case WorkPhase.SEED:
      return makeExecutionPacket(executorResult, workContext);

    case WorkPhase.EXECUTE:
    case WorkPhase.REVIEW:
      if (executorResult.packet_type === 'status_report_packet') {
        return makeStatusReportPacket(executorResult, workContext);
      }
      return makeRunStatePacket(executorResult, workContext);

    case WorkPhase.APPROVE:
      return makeApprovalPacket(executorResult, workContext);

    case WorkPhase.DEPLOY:
      return makeDeployPacket(executorResult, workContext);

    case WorkPhase.MONITOR:
      return makeMonitorPacket(executorResult, workContext);

    case WorkPhase.EXCEPTION:
      return makeExceptionPacket(executorResult, workContext);

    default:
      return makeUtilityPacket(executorResult, workContext);
  }
}

function workRef(workContext) {
  return {
    type: workContext.primary_type || 'none',
    id: workContext.run_id || workContext.project_id || null,
  };
}

function makeDiscoveryPacket(result, ctx) {
  return {
    packet_type: 'discovery',
    work_ref: workRef(ctx),
    founder_action_required: '구체적인 목표나 요청을 말씀해 주세요.',
    evidence_refs: [],
    next_actions: result.next_actions || ['목표를 구체화해 주세요'],
    text: result.text,
    blocks: result.blocks,
  };
}

function makeAlignPacket(result, ctx) {
  return {
    packet_type: 'align',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || null,
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || [],
    text: result.text,
    blocks: result.blocks,
    extra: {
      packet_id: result.packet_id,
      status_packet_id: result.status_packet_id,
    },
  };
}

function makeExecutionPacket(result, ctx) {
  return {
    packet_type: 'execution',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || null,
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || [],
    text: result.text,
    blocks: result.blocks,
    goal_line: result.goal_line || ctx.run?.project_goal,
    locked_scope_summary: result.locked_scope_summary || ctx.run?.locked_mvp_summary,
    packet_id: result.packet_id || ctx.run?.packet_id,
    run_id: result.run_id || ctx.run_id,
  };
}

function makeRunStatePacket(result, ctx) {
  const run = ctx.run;
  return {
    packet_type: 'run_state',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || null,
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || [],
    text: result.text,
    blocks: result.blocks,
    current_stage: run?.current_stage,
    status: run?.status,
    project_label: run?.project_label || ctx.project_space?.human_label,
  };
}

function makeStatusReportPacket(result, ctx) {
  return {
    packet_type: 'status_report_packet',
    work_ref: workRef(ctx),
    current_stage: result.current_stage || ctx.run?.current_stage || 'align',
    completed: result.completed || [],
    in_progress: result.in_progress || [],
    blocker: result.blocker || '없음',
    provider_truth: result.provider_truth || [],
    next_actions: result.next_actions || [],
    founder_action_required: result.founder_action_required || null,
    text: result.text,
    blocks: result.blocks,
  };
}

function makeApprovalPacket(result, ctx) {
  return {
    packet_type: 'approval',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || '승인/보류/반려를 결정해 주세요.',
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || ['승인', '보류', '반려'],
    text: result.text,
    blocks: result.blocks,
    topic: result.topic,
    recommendation: result.recommendation,
    packet_id: result.packet_id,
  };
}

function makeDeployPacket(result, ctx) {
  return {
    packet_type: 'deploy',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || null,
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || [],
    text: result.text,
    blocks: result.blocks,
    deploy_status: ctx.run?.deploy_status,
    deploy_url: ctx.run?.deploy_url,
  };
}

function makeMonitorPacket(result, ctx) {
  return {
    packet_type: 'monitor',
    work_ref: workRef(ctx),
    founder_action_required: null,
    evidence_refs: result.evidence_refs || [],
    next_actions: result.next_actions || [],
    text: result.text,
    blocks: result.blocks,
  };
}

function makeExceptionPacket(result, ctx) {
  return {
    packet_type: 'exception',
    work_ref: workRef(ctx),
    founder_action_required: result.founder_action_required || '관리자에게 문의해 주세요.',
    evidence_refs: [],
    next_actions: result.next_actions || ['재시도', '관리자 문의'],
    text: result.text,
    error_summary: result.error_summary || result.text,
  };
}

export function makeUtilityPacket(result, ctx) {
  return {
    packet_type: 'utility',
    work_ref: workRef(ctx || { primary_type: 'none' }),
    founder_action_required: null,
    evidence_refs: [],
    next_actions: [],
    text: result?.text,
    blocks: result?.blocks,
  };
}
