/**
 * Founder 대화: thread raw memory 주입 + Responses API tool loop (model-native orchestration).
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool } from './toolsBridge.js';

export { runHarnessOrchestration, invokeExternalTool };

const MAX_TOOL_ROUNDS = 8;

const COS_TOOLS = [
  {
    type: 'function',
    name: 'delegate_harness_team',
    description:
      'Scope가 충분히 구체화·락인된 뒤에만 호출한다. 내부 multi-persona harness team에 작업을 분배한다. 요구사항이 아직 모호하면 호출하지 말고 질문한다.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: '달성 목표 한 줄' },
        personas: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['research', 'pm', 'engineering', 'design', 'qa', 'data'],
          },
          description: '투입 페르소나',
        },
        tasks: { type: 'array', items: { type: 'string' }, description: '세부 작업 목록' },
        deliverables: { type: 'array', items: { type: 'string' }, description: '기대 산출물' },
        constraints: { type: 'array', items: { type: 'string' }, description: '제약·가정' },
      },
      required: ['objective'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'invoke_external_tool',
    description:
      'Cursor, GitHub, Supabase, Vercel, Railway 등 외부 도구 호출이 필요하고 scope가 충분히 락인된 경우에만 호출한다. founder에게 tool 이름·내부 페이로드를 그대로 노출하지 않는다.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: ['cursor', 'github', 'supabase', 'vercel', 'railway'],
          description: '호출할 외부 도구',
        },
        action: { type: 'string', description: '수행할 액션 식별자' },
        payload: {
          type: 'object',
          additionalProperties: true,
          description: '도구별 인자',
        },
      },
      required: ['tool', 'action'],
      additionalProperties: false,
    },
  },
];

/**
 * @param {string} constitutionMarkdown
 */
export function buildSystemInstructions(constitutionMarkdown) {
  return [
    '당신은 G1 COS다. Slack의 founder와 직접 대화하는 단일 어시스턴트다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법에 나온 금지 문자열·레거시 표면을 founder에게 출력하지 마라.',
    '한국어 자연어로 답하라. 필요하면 짧게 되물며 scope를 대화 속에서 자연스럽게 좁혀라.',
    'founder가 아직 요구사항을 구체화하는 중이면 delegate_harness_team / invoke_external_tool 을 호출하지 말고 질문으로 scope를 잡아라.',
    '충분히 락인된 뒤에만 도구를 호출한다. 도구 호출 내용·원시 JSON을 founder에게 그대로 보여주지 말고, 자연어로 결과만 요약한다.',
    '',
    '--- 헌법 시작 ---',
    constitutionMarkdown,
    '--- 헌법 끝 ---',
  ].join('\n');
}

/**
 * @param {{
 *   recentTurns: { role: string, text: string, attachments?: object[] }[],
 *   userText: string,
 *   attachmentResults: { filename: string, ok: boolean, summary?: string, reason?: string }[],
 *   metadata: Record<string, unknown>,
 * }} p
 */
export function buildFounderConversationInput(p) {
  const lines = [];
  lines.push('[최근 대화]');
  const rt = p.recentTurns || [];
  if (!rt.length) lines.push('(이전 턴 없음)');
  else {
    for (const t of rt) {
      const prefix = t.role === 'assistant' ? 'assistant' : 'user';
      lines.push(`${prefix}: ${String(t.text || '').slice(0, 8000)}`);
      if (t.attachments?.length) {
        lines.push(`  [그 턴 첨부] ${JSON.stringify(t.attachments).slice(0, 2000)}`);
      }
    }
  }
  lines.push('');
  lines.push('[현재 턴]');
  lines.push(`user: ${String(p.userText || '').trim()}`);
  const attLines = [];
  for (const r of p.attachmentResults || []) {
    const fn = String(r.filename || '첨부');
    if (r.ok && r.summary) attLines.push(`- ${fn}: ${String(r.summary).slice(0, 8000)}`);
    else attLines.push(`- ${fn}: (읽기 실패) ${String(r.reason || '').slice(0, 500)}`);
  }
  lines.push(attLines.length ? 'attachments:\n' + attLines.join('\n') : 'attachments: (없음)');
  lines.push('');
  lines.push('[최소 메타 — 앱은 의미 분류하지 않음]');
  lines.push(
    JSON.stringify({
      channel: p.metadata?.channel,
      user: p.metadata?.user,
      ts: p.metadata?.ts,
      thread_ts: p.metadata?.thread_ts,
      channel_type: p.metadata?.channel_type,
    }),
  );
  return lines.join('\n');
}

/**
 * @param {import('openai').default} openai
 * @param {string} model
 * @param {string} instructions
 * @param {string} initialInput
 */
async function runToolLoop(openai, model, instructions, initialInput) {
  let previousResponseId = null;
  /** @type {Array<{ type: 'function_call_output', call_id: string, output: string }> | null} */
  let toolOutputs = null;
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    /** @type {Record<string, unknown>} */
    const req = {
      model,
      instructions,
      tools: COS_TOOLS,
      tool_choice: 'auto',
    };
    if (previousResponseId) {
      req.previous_response_id = previousResponseId;
      req.input = toolOutputs;
    } else {
      req.input = initialInput;
    }

    const res = await openai.responses.create(req);
    previousResponseId = res.id;

    const output = Array.isArray(res.output) ? res.output : [];
    const calls = output.filter((x) => x && x.type === 'function_call');

    if (!calls.length) {
      lastText = String(res.output_text || '').trim();
      break;
    }

    const outs = [];
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(String(call.arguments || '{}'));
      } catch {
        args = {};
      }
      let result;
      if (call.name === 'delegate_harness_team') {
        result = await runHarnessOrchestration(args);
      } else if (call.name === 'invoke_external_tool') {
        result = await invokeExternalTool(args);
      } else {
        result = { ok: false, error: 'unknown_tool', name: call.name };
      }
      outs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    toolOutputs = outs;
  }

  if (!lastText) {
    const err = new Error('cos_empty_output_or_tool_loop_exhausted');
    err.code = 'cos_empty_output';
    throw err;
  }

  return { text: lastText, previousResponseId };
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
 *   recentTurns: { role: string, text: string, attachments?: object[], ts?: string }[],
 * }} ctx
 */
export async function runFounderDirectConversation(ctx) {
  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const initialInput = buildFounderConversationInput({
    recentTurns: ctx.recentTurns || [],
    userText: ctx.userText,
    attachmentResults: ctx.attachmentResults || [],
    metadata: ctx.metadata || {},
  });

  const { text } = await runToolLoop(ctx.openai, ctx.model, instructions, initialInput);

  console.info(
    JSON.stringify({
      stage: 'cos_turn',
      constitution_sha256: ctx.constitutionSha256,
      output_chars: text.length,
    }),
  );

  return { text };
}
