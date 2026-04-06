/**
 * vNext.13.16 — COS 직접 대화 코어. 헌법 전문을 system instructions에 넣고 한 턴 응답만 생성.
 * 별도 formatter·Council surface·플래너 후처리 없음.
 */

/**
 * @param {Record<string, unknown>} metadata
 * @returns {string[]}
 */
function attachmentPromptLines(metadata = {}) {
  const ok = Array.isArray(metadata.current_attachment_contexts) ? metadata.current_attachment_contexts : [];
  const failed = Array.isArray(metadata.current_attachment_failures) ? metadata.current_attachment_failures : [];
  const failureNotes = Array.isArray(metadata.failure_notes) ? metadata.failure_notes : [];
  const lines = [];
  for (const x of ok) {
    const name = String(x?.filename || '첨부').trim();
    const summary = String(x?.summary || '').trim();
    if (summary) lines.push(`- ${name}: ${summary.slice(0, 1600)}`);
  }
  if (failureNotes.length) {
    for (const note of failureNotes) {
      const t = String(note || '').trim();
      if (t) lines.push(`- 첨부 실패: ${t.slice(0, 300)}`);
    }
    return lines;
  }
  for (const x of failed) {
    const name = String(x?.filename || '첨부').trim();
    const reason = String(x?.reason || '첨부를 읽지 못했습니다.').trim();
    lines.push(`- ${name}: ${reason.slice(0, 300)}`);
  }
  return lines;
}

function buildUserPayload(userText, metadata) {
  let u = String(userText || '').trim();
  const al = attachmentPromptLines(metadata);
  if (al.length) u += `\n\n[현재 턴 첨부]\n${al.join('\n')}`;
  return u;
}

function buildInstructions(constitutionMarkdown) {
  return [
    '당신은 G1 COS다. Slack에서 창업자(founder)와 직접 대화하는 단일 어시스턴트다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법과 어긋나는 출력 형식(보고서 목차, 내부 라우팅 노출, 등록·협의 유도 템플릿 등)은 사용하지 마라.',
    '응답은 한국어 자연어로, 필요한 만큼만 구체적으로 작성하라.',
    '',
    '--- 헌법 시작 ---',
    constitutionMarkdown,
    '--- 헌법 끝 ---',
  ].join('\n');
}

/**
 * @param {{
 *   callText: (opts: { instructions: string, input: string }) => Promise<string>,
 *   constitutionMarkdown: string,
 *   userText: string,
 *   metadata?: Record<string, unknown>,
 * }} ctx
 */
export async function runFounderDirectConversation({
  callText,
  constitutionMarkdown,
  userText,
  metadata = {},
}) {
  const instructions = buildInstructions(constitutionMarkdown);
  const input = buildUserPayload(userText, metadata);
  const text = await callText({ instructions, input });
  return {
    text: String(text || '').trim(),
    surface_type: 'partner_natural_surface',
    trace: {
      surface_type: 'partner_natural_surface',
      responder_kind: 'founder_cos',
      founder_direct_conversation: true,
      pipeline_version: 'vNext.13.16.constitution_only',
      founder_surface_source: 'direct_conversation_core',
      founder_legacy_world_bypassed: true,
      handle_user_text_bypassed: true,
      egress_contract_required: true,
    },
  };
}
