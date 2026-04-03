/**
 * vNext.13 — 제안 패킷 스키마 + Slack용 포맷터.
 * (내용 채움은 founderProposalKernel; 여기는 형태·렌더만.)
 */

/**
 * @returns {Record<string, unknown>}
 */
export function emptyProposalPacket() {
  return {
    understood_request: '',
    context_assumptions: [],
    open_questions: [],
    cos_only_tasks: [],
    internal_support_tasks: [],
    external_execution_tasks: [],
    proposed_roadmap: [],
    proposed_deliverables: [],
    expected_impact: [],
    risks: [],
    approval_required: false,
    approval_reason: '',
    approval_options: [
      '이대로 진행',
      '일부만 진행',
      '드래프트만 생성',
      '다시 정리',
      '보류',
    ],
    proposal_execution_contract: null,
    proposal_contract_trace: null,
  };
}

/**
 * @param {Record<string, unknown>} packet
 * @returns {string}
 */
export function formatProposalPacketForSlack(packet) {
  const sec = (title, lines) => {
    const L = (lines || []).filter(Boolean);
    if (!L.length) return `*${title}*\n_(해당 없음 또는 후속 질문으로 좁힙니다.)_\n`;
    return `*${title}*\n${L.map((l) => `• ${l}`).join('\n')}\n`;
  };

  return [
    '*[COS 제안 패킷]*',
    '',
    sec('1. 제가 이해한 요청', [packet.understood_request].filter(Boolean)),
    sec('2. 현재 맥락/전제', packet.context_assumptions),
    sec('3. 아직 불명확한 점', packet.open_questions),
    sec('4. 제가 여기서 직접 처리할 일 (COS_ONLY)', packet.cos_only_tasks),
    sec('5. 내부 하네스를 돌리면 좋은 일 (INTERNAL_SUPPORT)', packet.internal_support_tasks),
    sec('6. 외부 툴 실행이 필요한 일 (EXTERNAL_EXECUTION)', packet.external_execution_tasks),
    sec('7. 예상 로드맵', packet.proposed_roadmap),
    sec('8. 예상 딜리버러블', packet.proposed_deliverables),
    sec('9. 기대효과', packet.expected_impact),
    sec('10. 리스크 / 확인 필요사항', packet.risks),
    '*11. 승인 옵션*',
    ...(packet.approval_options || []).map((o) => `• ${o}`),
    '',
  ].join('\n');
}
