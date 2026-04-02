/**
 * COS Constitution v1.1 — Surface-type-aware founder-facing renderer.
 * Supports Meta/Utility, OS Surfaces, Executive Surfaces with Freedom Levels.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §5
 */

// GREP_COS_CONSTITUTION_RENDERER

import { FounderSurfaceType, SAFE_FALLBACK_TEXT, DISCOVERY_PROMPT_TEXT } from './founderContracts.js';
import { firstCouncilLeakRuleHit } from '../testing/councilLeakRules.js';

// --- L0 Strict Packet renderers ---

/** Viewpoints that look like legacy persona lines (`strategy_finance: …`) must not render as deliberation output. */
function viewpointLooksLikePersonaSlug(line) {
  return /^\s*[a-z][a-z0-9_]*:\s/.test(String(line || ''));
}

function renderDecisionPacket(payload) {
  const d = payload.deliberation ?? payload;
  if (!d || typeof d !== 'object' || (!d.recommendation && !d.one_line_summary)) return { text: SAFE_FALLBACK_TEXT };

  const lines = [];
  if (d.one_line_summary) lines.push(`*요약*\n${d.one_line_summary}`);
  if (d.recommendation) lines.push(`*COS 권고*\n${d.recommendation}`);
  if (d.viewpoints?.length) lines.push(`*주요 관점*\n${d.viewpoints.map((v) => `- ${v}`).join('\n')}`);
  if (d.objections?.length) lines.push(`*주요 반론*\n${d.objections[0]}`);
  if (d.tensions?.length) lines.push(`*미해결 쟁점*\n${d.tensions.map((t) => `- ${t}`).join('\n')}`);
  if (d.risks?.length) lines.push(`*리스크*\n${d.risks.map((r) => `- ${r}`).join('\n')}`);
  lines.push(`*다음 행동*\n${d.next_actions?.length ? d.next_actions.map((a) => `- ${a}`).join('\n') : '- 없음'}`);
  if (d.decision_needed) lines.push(`*대표 결정 필요*\n${d.decision_question || '결정이 필요합니다.'}`);

  const text = lines.join('\n\n');
  if (firstCouncilLeakRuleHit(text)) return { text: SAFE_FALLBACK_TEXT };
  if (d.viewpoints?.some((v) => viewpointLooksLikePersonaSlug(v))) return { text: SAFE_FALLBACK_TEXT };
  return { text };
}

function renderApprovalPacket(payload) {
  const lines = ['*[승인 요청]*'];
  if (payload.topic) lines.push(`*주제:* ${payload.topic}`);
  if (payload.recommendation) lines.push(`*COS 권고:* ${payload.recommendation}`);
  if (payload.founder_action_required) lines.push(`*필요 결정:* ${payload.founder_action_required}`);
  if (payload.next_actions?.length) lines.push(`*다음 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  if (payload.packet_id) lines.push(`\`packet_id: ${payload.packet_id}\``);
  return { text: lines.join('\n'), blocks: payload.blocks };
}

function renderExecutionPacket(payload) {
  const lines = ['*[실행 패킷 · Launch]*'];
  if (payload.locked_scope_summary) lines.push(`*1. 잠긴 범위*\n${payload.locked_scope_summary}`);
  if (payload.goal_line) lines.push(`*목표 한 줄*\n${payload.goal_line}`);
  if (payload.project_space?.id || payload.project_space?.label) {
    lines.push(
      `*2. 프로젝트 스페이스*\n- id: \`${payload.project_space.id || '-'}\`\n- label: ${payload.project_space.label || '-'}`,
    );
  }
  if (payload.run_id || payload.run_summary) {
    const rs = payload.run_summary || {};
    lines.push(
      `*3. Run*\n- \`${payload.run_id || rs.run_id || '-'}\` · stage: ${rs.stage || '-'} · status: ${rs.status || '-'}`,
    );
  }
  if (payload.packet_id) lines.push(`\`packet_id: ${payload.packet_id}\``);
  if (payload.workstreams?.length) {
    lines.push(`*워크스트림*\n${payload.workstreams.map((w) => `- ${w}`).join('\n')}`);
  }
  if (payload.provider_truth?.length) {
    lines.push(`*4. Provider truth*\n${payload.provider_truth.map((t) => `- ${t}`).join('\n')}`);
  }
  if (payload.immediate_actions?.length) {
    lines.push(`*5. 지금 바로 시작*\n${payload.immediate_actions.map((a) => `- ${a}`).join('\n')}`);
  }
  if (payload.manual_bridge_actions?.length) {
    lines.push(`*6. 수동 브리지*\n${payload.manual_bridge_actions.map((a) => `- ${a}`).join('\n')}`);
  }
  if (payload.defaults_applied?.length) {
    lines.push(`*적용된 기본값*\n${payload.defaults_applied.map((d) => `- ${d}`).join('\n')}`);
  }
  if (payload.blocker) lines.push(`*blocker:* ${payload.blocker}`);
  if (payload.founder_next_action) lines.push(`*7. 대표 next action*\n${payload.founder_next_action}`);
  if (payload.next_actions?.length && !payload.immediate_actions?.length) {
    lines.push(`*다음 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  }
  return { text: lines.join('\n\n'), blocks: payload.blocks };
}

function renderLaunchBlockedPacket(payload) {
  const lines = ['*[Launch 보류]*', `*판정:* ${payload.readiness || '-'}`];
  if (payload.blockers?.length) {
    lines.push(`*블로커*\n${payload.blockers.map((b) => `- ${b}`).join('\n')}`);
  }
  lines.push(`*대표 next action*\n${payload.founder_next_action || '목표를 한 줄로 보내 주세요.'}`);
  return { text: lines.join('\n\n') };
}

function renderDeployPacket(payload) {
  const lines = ['*[배포 패킷]*'];
  if (payload.deploy_status) lines.push(`*배포 상태:* ${payload.deploy_status}`);
  if (payload.deploy_url) lines.push(`*배포 URL:* ${payload.deploy_url}`);
  if (payload.founder_action_required) lines.push(`*필요 결정:* ${payload.founder_action_required}`);
  if (payload.next_actions?.length) lines.push(`*다음 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  return { text: lines.join('\n'), blocks: payload.blocks };
}

function renderException(payload) {
  const lines = ['*[COS 예외]*'];
  if (payload.error_summary) lines.push(payload.error_summary);
  else lines.push('처리 중 오류가 발생했습니다.');
  if (payload.next_actions?.length) lines.push(`*복구 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  return { text: lines.join('\n') };
}

// --- L1 Semi-structured renderers ---

function renderRunState(payload) {
  const lines = [];
  if (payload.project_label) lines.push(`*프로젝트:* ${payload.project_label}`);
  if (payload.current_stage) lines.push(`*단계:* ${payload.current_stage}`);
  if (payload.status) lines.push(`*상태:* ${payload.status}`);
  if (payload.text) lines.push(payload.text);
  if (payload.next_actions?.length) lines.push(`*다음 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  return { text: lines.join('\n') || payload.text || SAFE_FALLBACK_TEXT, blocks: payload.blocks };
}

function renderProjectSpace(payload) {
  const lines = [];
  if (payload.project_id) lines.push(`*프로젝트 ID:* \`${payload.project_id}\``);
  if (payload.human_label) lines.push(`*이름:* ${payload.human_label}`);
  if (payload.status) lines.push(`*상태:* ${payload.status}`);
  if (payload.text) lines.push(payload.text);
  return { text: lines.join('\n') || payload.text || SAFE_FALLBACK_TEXT };
}

function renderDialogueSurface(payload) {
  const lines = ['[COS 전략 대화]'];
  if (payload.reframed_problem) lines.push(payload.reframed_problem);
  if (payload.benchmark_axes?.length) lines.push(`*벤치마크 축*\n- ${payload.benchmark_axes.join('\n- ')}`);
  if (payload.mvp_scope_in?.length) lines.push(`*MVP 범위*\n- ${payload.mvp_scope_in.join('\n- ')}`);
  if (payload.mvp_scope_out?.length) lines.push(`*제외 범위*\n- ${payload.mvp_scope_out.join('\n- ')}`);
  if (payload.risk_points?.length) lines.push(`*핵심 리스크/검증 포인트*\n- ${payload.risk_points.join('\n- ')}`);
  if (payload.pushback_point) lines.push(`*반박 포인트*\n${payload.pushback_point}`);
  if (payload.tradeoff_summary) lines.push(`*트레이드오프*\n${payload.tradeoff_summary}`);
  if (payload.alternatives?.length) lines.push(`*대안*\n- ${payload.alternatives.join('\n- ')}`);
  if (payload.scope_cut) lines.push(`*범위 절삭*\n${payload.scope_cut}`);
  if (payload.key_questions?.length) lines.push(`*지금 합의할 질문*\n- ${payload.key_questions.join('\n- ')}`);
  if (payload.next_step) lines.push(`*다음 단계*\n${payload.next_step}`);
  return { text: lines.join('\n\n') };
}

function renderScopeLockPacket(payload) {
  const lines = ['*[Scope Lock Packet]*'];
  lines.push(`*프로젝트명:* ${payload.project_name || '-'}`);
  lines.push(`*문제 정의:* ${payload.problem_definition || '-'}`);
  lines.push(`*타겟 사용자:*\n- ${(payload.target_users || []).join('\n- ') || '-'}`);
  lines.push(`*MVP 범위:*\n- ${(payload.mvp_scope || []).join('\n- ') || '-'}`);
  lines.push(`*제외 범위:*\n- ${(payload.excluded_scope || []).join('\n- ') || '-'}`);
  lines.push(`*핵심 가설:* ${payload.core_hypothesis || '-'}`);
  lines.push(`*성공 지표:*\n- ${(payload.success_metrics || []).join('\n- ') || '-'}`);
  lines.push(`*리스크:*\n- ${(payload.key_risks || []).join('\n- ') || '-'}`);
  lines.push(`*초기 아키텍처 방향:* ${payload.initial_architecture || '-'}`);
  lines.push(`*추천 실행 순서:*\n- ${(payload.recommended_sequence || []).join('\n- ') || '-'}`);
  lines.push(`*Founder 승인 필요:* ${payload.founder_approval_required ? '예' : '아니오'}`);
  if (payload.packet_id) lines.push(`\`packet_id: ${payload.packet_id}\``);
  if (payload.run_id) lines.push(`\`run_id: ${payload.run_id}\``);
  return { text: lines.join('\n\n') };
}

function renderStatusReportPacket(payload) {
  const lines = ['*[진행 보고]*'];
  lines.push(`*현재 단계:* ${payload.current_stage || '-'}`);
  lines.push(`*완료된 것:*\n- ${(payload.completed || []).join('\n- ') || '-'}`);
  lines.push(`*진행 중:*\n- ${(payload.in_progress || []).join('\n- ') || '-'}`);
  lines.push(`*blocker:* ${payload.blocker || '없음'}`);
  lines.push(`*외부 툴 truth:*\n- ${(payload.provider_truth || []).join('\n- ') || '-'}`);
  lines.push(`*다음 예정 작업:*\n- ${(payload.next_actions || []).join('\n- ') || '-'}`);
  lines.push(`*Founder action 필요:* ${payload.founder_action_required || '없음'}`);
  return { text: lines.join('\n\n') };
}

function renderHandoffPacket(payload) {
  const lines = ['*[Execution Handoff]*'];
  lines.push(`*프로젝트:* ${payload.project_ref || '-'}`);
  lines.push(`*run:* ${payload.run_ref || '-'}`);
  lines.push(`*dispatched workstreams:*\n- ${(payload.dispatched_workstreams || []).join('\n- ') || '-'}`);
  lines.push(`*provider truth:*\n- ${(payload.provider_truth || []).join('\n- ') || '-'}`);
  lines.push(`*다음 founder action:* ${payload.founder_next_action || '없음'}`);
  return { text: lines.join('\n\n') };
}

// --- Renderer dispatch ---

const SURFACE_RENDERERS = {
  // Meta / Utility
  [FounderSurfaceType.RUNTIME_META]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.META_DEBUG]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.HELP]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.SAFE_FALLBACK]: () => ({ text: SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.DISCOVERY]: (p) => ({ text: p.text || DISCOVERY_PROMPT_TEXT }),
  [FounderSurfaceType.PARTNER_NATURAL]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.DIALOGUE]: renderDialogueSurface,
  [FounderSurfaceType.SCOPE_LOCK_PACKET]: renderScopeLockPacket,
  [FounderSurfaceType.STATUS_REPORT]: renderStatusReportPacket,
  [FounderSurfaceType.ORCHESTRATION_HANDOFF]: renderHandoffPacket,
  [FounderSurfaceType.ESCALATION]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),

  // OS Surfaces
  [FounderSurfaceType.PROJECT_SPACE]: renderProjectSpace,
  [FounderSurfaceType.RUN_STATE]: renderRunState,
  [FounderSurfaceType.EXECUTION_PACKET]: renderExecutionPacket,
  [FounderSurfaceType.LAUNCH_BLOCKED]: renderLaunchBlockedPacket,
  [FounderSurfaceType.APPROVAL_PACKET]: renderApprovalPacket,
  [FounderSurfaceType.DEPLOY_PACKET]: renderDeployPacket,
  [FounderSurfaceType.MANUAL_BRIDGE]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.MONITORING]: (p) => ({ text: p.text || '*[모니터링]* 배포 후 상태를 확인 중입니다.' }),
  [FounderSurfaceType.EXCEPTION]: renderException,
  [FounderSurfaceType.EVIDENCE]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),

  // Executive Surfaces
  [FounderSurfaceType.EXECUTIVE_KICKOFF]: (p) => ({
    text: p.text || SAFE_FALLBACK_TEXT,
    blocks: p.blocks,
  }),
  [FounderSurfaceType.EXECUTIVE_STATUS]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.DECISION_PACKET]: renderDecisionPacket,
  [FounderSurfaceType.STRUCTURED_COMMAND]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.QUERY]: (p) => ({
    text: p.text || SAFE_FALLBACK_TEXT,
    blocks: p.blocks,
  }),
};

/**
 * Render a founder-facing response for the given surface type and payload.
 * @param {string} surfaceType
 * @param {Record<string, unknown>} payload
 * @returns {{ text: string, blocks?: object[] }}
 */
export function renderFounderSurface(surfaceType, payload = {}) {
  const renderer = SURFACE_RENDERERS[surfaceType];
  if (!renderer) return { text: SAFE_FALLBACK_TEXT };
  const out = renderer(payload);
  return { text: String(out.text ?? ''), ...(out.blocks != null ? { blocks: out.blocks } : {}) };
}

export function renderDeliberation(deliberation) {
  return renderFounderSurface(FounderSurfaceType.DECISION_PACKET, { deliberation });
}
