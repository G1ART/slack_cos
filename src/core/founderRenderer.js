/**
 * COS Constitution v1.1 — Surface-type-aware founder-facing renderer.
 * Supports Meta/Utility, OS Surfaces, Executive Surfaces with Freedom Levels.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §5
 */

// GREP_COS_CONSTITUTION_RENDERER

import { FounderSurfaceType, SAFE_FALLBACK_TEXT, DISCOVERY_PROMPT_TEXT } from './founderContracts.js';

const INTERNAL_MARKER_SUBSTRINGS = [
  '종합 추천안', '페르소나별 핵심 관점', '가장 강한 반대 논리',
  '핵심 리스크', '대표 결정 필요 여부', '내부 처리 정보',
  'strategy_finance:', 'risk_review:', '참여 페르소나:',
];

function containsInternalMarkers(text) {
  const t = String(text || '');
  return INTERNAL_MARKER_SUBSTRINGS.some((m) => t.includes(m));
}

function guardOutput(result) {
  const text = String(result.text || '');
  if (containsInternalMarkers(text)) {
    return { text: SAFE_FALLBACK_TEXT };
  }
  return { text, blocks: result.blocks };
}

// --- L0 Strict Packet renderers ---

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

  return { text: lines.join('\n\n') };
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
  const lines = ['*[실행 패킷]*'];
  if (payload.goal_line) lines.push(`*목표:* ${payload.goal_line}`);
  if (payload.locked_scope_summary) lines.push(`*범위:* ${payload.locked_scope_summary}`);
  if (payload.next_actions?.length) lines.push(`*다음 행동:*\n${payload.next_actions.map((a) => `- ${a}`).join('\n')}`);
  if (payload.packet_id) lines.push(`\`packet_id: ${payload.packet_id}\``);
  if (payload.run_id) lines.push(`\`run_id: ${payload.run_id}\``);
  return { text: lines.join('\n'), blocks: payload.blocks };
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

// --- Renderer dispatch ---

const SURFACE_RENDERERS = {
  // Meta / Utility
  [FounderSurfaceType.RUNTIME_META]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.META_DEBUG]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.HELP]: (p) => ({ text: p.text || SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.SAFE_FALLBACK]: () => ({ text: SAFE_FALLBACK_TEXT }),
  [FounderSurfaceType.DISCOVERY]: (p) => ({ text: p.text || DISCOVERY_PROMPT_TEXT }),

  // OS Surfaces
  [FounderSurfaceType.PROJECT_SPACE]: renderProjectSpace,
  [FounderSurfaceType.RUN_STATE]: renderRunState,
  [FounderSurfaceType.EXECUTION_PACKET]: renderExecutionPacket,
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
  return guardOutput(renderer(payload));
}

export function renderDeliberation(deliberation) {
  return renderFounderSurface(FounderSurfaceType.DECISION_PACKET, { deliberation });
}
