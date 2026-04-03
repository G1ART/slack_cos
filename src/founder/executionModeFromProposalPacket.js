/**
 * vNext.13 — 실행 모드는 창업자 원문 분류기가 아니라 제안 패킷(planner decision)에서만 도출.
 */

/** @typedef {'COS_ONLY'|'INTERNAL_SUPPORT'|'EXTERNAL_EXECUTION_REQUIRES_APPROVAL'} FounderExecutionMode */

/**
 * COS_ONLY 우선: 외부 신호가 약하면 Slack 내 응답·토론·초안만.
 * @param {{ external_execution_tasks?: string[], internal_support_tasks?: string[], cos_only_tasks?: string[] }} packet
 * @returns {FounderExecutionMode}
 */
export function selectExecutionModeFromProposalPacket(packet) {
  const ext = packet?.external_execution_tasks || [];
  const internal = packet?.internal_support_tasks || [];
  const cos = packet?.cos_only_tasks || [];

  if (Array.isArray(ext) && ext.length > 0) {
    return 'EXTERNAL_EXECUTION_REQUIRES_APPROVAL';
  }
  if (Array.isArray(internal) && internal.length > 0) {
    return 'INTERNAL_SUPPORT';
  }
  if (Array.isArray(cos) && cos.length > 0) {
    return 'COS_ONLY';
  }
  return 'COS_ONLY';
}
