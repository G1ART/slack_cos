/**
 * Context Synthesis — founder 연속/수정 모드.
 *
 * "내가 원한건...", "지금 우리가 무슨 얘기 하고 있었지?",
 * "이 문서를 토대로 원래 요청을 더 구체화해" 등의 발화에 대해
 * 기존 결정을 종합하고 변경된 부분을 식별하여 다음 artifact를 생성.
 */

const CONTINUATION_RE = /내가\s*원한건|원래\s*(?:요청|의도|방향)|지금\s*(?:우리가|뭘|무슨)\s*(?:\S+\s*)*?(?:얘기|논의|대화)|어디까지\s*했|무슨\s*얘기|what\s*were\s*we|continue\s*from|pick\s*up\s*where/i;
const CORRECTION_RE = /그게\s*아니라|아니야|다시\s*정리하면|수정하면|변경\s*사항|바꿔야|correction|actually|let\s*me\s*clarify/i;
const DOCUMENT_REFINE_RE = /(?:이\s*)?문서.*(?:토대로|기준으로|바탕으로|참고해서).*(?:구체화|수정|보완|반영|정리)|(?:read\s*this|use\s*this.*doc)/i;
const SYNTHESIS_REQUEST_RE = /지금까지.*(?:정리|요약|종합)|summarize\s*(?:our|the)\s*(?:discussion|progress)/i;

/**
 * Detect the type of continuation/correction intent.
 * @returns {'continuation'|'correction'|'document_refine'|'synthesis_request'|null}
 */
export function detectContinuationIntent(text) {
  if (!text) return null;
  if (DOCUMENT_REFINE_RE.test(text)) return 'document_refine';
  if (CORRECTION_RE.test(text)) return 'correction';
  if (SYNTHESIS_REQUEST_RE.test(text)) return 'synthesis_request';
  if (CONTINUATION_RE.test(text)) return 'continuation';
  return null;
}

/**
 * Build a context synthesis prompt for the LLM.
 * Combines resolved slots, document context, and recent transcript.
 */
export function buildContextSynthesisPrompt({ intent, resolvedSlots, documentContext, recentTranscript, currentText }) {
  const resolved = resolvedSlots || {};
  const resolvedLines = Object.entries(resolved)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 200)}`);

  const base = [
    '[CONTEXT SYNTHESIS]',
    `요청 유형: ${intent}`,
    '',
  ];

  if (resolvedLines.length) {
    base.push('이미 확정된 사항:', ...resolvedLines, '');
  }

  if (documentContext) {
    base.push('[첨부 문서 내용]', String(documentContext).slice(0, 4000), '');
  }

  if (recentTranscript) {
    base.push('[최근 대화]', String(recentTranscript).slice(-2000), '');
  }

  if (currentText) {
    base.push(`[현재 요청] ${currentText}`, '');
  }

  const instructions = {
    continuation: [
      'INSTRUCTIONS:',
      '1. 이미 확정된 사항을 종합하세요',
      '2. 현재 진행 상태를 간결하게 정리하세요',
      '3. 다음에 할 일 / 필요한 artifact를 제시하세요',
      '4. 이미 답변된 기본 질문을 다시 하지 마세요',
      '5. kickoff 재시작 금지',
    ],
    correction: [
      'INSTRUCTIONS:',
      '1. founder의 수정 사항을 파악하세요',
      '2. 기존 확정 사항 중 변경되는 부분만 업데이트하세요',
      '3. 변경되지 않는 사항은 유지하세요',
      '4. 수정 반영 후 다음 단계를 제시하세요',
    ],
    document_refine: [
      'INSTRUCTIONS:',
      '1. 첨부 문서의 내용을 기존 전략/방향과 대조하세요',
      '2. 문서가 변경하는 사항을 명시하세요',
      '3. 기존 방향에서 유지되는 사항을 확인하세요',
      '4. 통합된 전략/제품 방향을 제시하세요',
      '5. 문서 내용이 없으면 기존 맥락으로 best-effort 진행하되 사실을 명시',
    ],
    synthesis_request: [
      'INSTRUCTIONS:',
      '1. 지금까지 확정된 모든 사항을 종합하세요',
      '2. 미결 사항을 명시하세요',
      '3. 다음 필요 행동을 제시하세요',
    ],
  };

  base.push(...(instructions[intent] || instructions.continuation));

  return base.join('\n');
}

/**
 * Determine if the current message warrants context synthesis mode.
 */
export function shouldActivateContextSynthesis({ text, hasDocumentContext, resolvedSlotCount }) {
  const intent = detectContinuationIntent(text);
  if (intent) return { activate: true, intent };

  if (hasDocumentContext && resolvedSlotCount > 0) {
    return { activate: true, intent: 'document_refine' };
  }

  return { activate: false, intent: null };
}
