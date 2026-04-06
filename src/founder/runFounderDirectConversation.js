/**
 * Founder 대화 본체: 헌법 주입 + OpenAI Responses 한 턴. 포맷터 없음.
 * harnessBridge / toolsBridge는 파일로 존재하며, COS tool-use 연결 시 여기서 호출한다.
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool } from './toolsBridge.js';

export { runHarnessOrchestration, invokeExternalTool };

/**
 * @param {string} constitutionMarkdown
 */
export function buildSystemInstructions(constitutionMarkdown) {
  return [
    '당신은 G1 COS다. Slack의 founder와 직접 대화하는 단일 어시스턴트다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법에 나온 금지 문자열·레거시 표면을 출력에 포함하지 마라.',
    '한국어 자연어로 답하라. 필요하면 짧게 되물으며 scope를 자연스럽게 좁혀라.',
    '',
    '--- 헌법 시작 ---',
    constitutionMarkdown,
    '--- 헌법 끝 ---',
  ].join('\n');
}

/**
 * @param {string} userText
 * @param {{ filename: string, ok: boolean, summary?: string, reason?: string }[]} attachmentResults
 * @param {Record<string, unknown>} metadata
 */
export function buildUserInput(userText, attachmentResults, metadata) {
  let u = String(userText || '').trim();
  const lines = [];
  for (const r of attachmentResults || []) {
    const fn = String(r.filename || '첨부');
    if (r.ok && r.summary) {
      lines.push(`- ${fn}: ${String(r.summary).slice(0, 8000)}`);
    } else {
      lines.push(`- ${fn}: (읽기 실패) ${String(r.reason || '이유 없음').slice(0, 500)}`);
    }
  }
  if (lines.length) {
    u += `\n\n[현재 턴 첨부]\n${lines.join('\n')}`;
  }
  u += `\n\n[최소 메타 — 의미 분류 금지]\n${JSON.stringify({
    channel: metadata.channel,
    user: metadata.user,
    ts: metadata.ts,
    thread_ts: metadata.thread_ts,
    channel_type: metadata.channel_type,
  })}`;
  return u;
}

/**
 * @param {{
 *   openai: import('openai').default,
 *   model: string,
 *   constitutionMarkdown: string,
 *   constitutionSha256: string,
 *   userText: string,
 *   attachmentResults: { filename: string, ok: boolean, summary?: string, reason?: string }[],
 *   metadata: Record<string, unknown>,
 * }} ctx
 */
export async function runFounderDirectConversation(ctx) {
  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const input = buildUserInput(ctx.userText, ctx.attachmentResults, ctx.metadata);

  const response = await ctx.openai.responses.create({
    model: ctx.model,
    instructions,
    input,
  });

  const text = String(response.output_text || '').trim();
  if (!text) {
    const err = new Error('cos_empty_output');
    err.code = 'cos_empty_output';
    throw err;
  }

  console.info(
    JSON.stringify({
      stage: 'cos_turn',
      constitution_sha256: ctx.constitutionSha256,
      output_chars: text.length,
    }),
  );

  return { text, response };
}
