/**
 * Founder 대화: thread raw memory 주입 + Responses API tool loop (model-native orchestration).
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool } from './toolsBridge.js';

export { runHarnessOrchestration, invokeExternalTool };

const MAX_TOOL_ROUNDS = 8;

const ALLOWED_EXTERNAL_TOOLS = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);
const ALLOWED_EXTERNAL_ACTIONS = new Set([
  'plan',
  'create_spec',
  'emit_patch',
  'create_issue',
  'open_pr',
  'apply_sql',
  'deploy',
  'inspect_logs',
]);

/**
 * Tool-call 인자의 기계적 스키마 검증만 (대화 성숙도·의도는 검사하지 않음).
 * @param {string} callName
 * @param {Record<string, unknown>} args
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function validateToolCallArgs(callName, args) {
  const a = args && typeof args === 'object' ? args : {};

  if (callName === 'delegate_harness_team') {
    const objective = a.objective;
    if (typeof objective !== 'string' || !objective.trim()) {
      return { blocked: true, reason: 'invalid_payload' };
    }
    return { blocked: false };
  }

  if (callName === 'invoke_external_tool') {
    const tool = a.tool;
    const action = String(a.action || '').trim();
    const payload = a.payload;
    if (!ALLOWED_EXTERNAL_TOOLS.has(tool)) return { blocked: true, reason: 'unsupported_tool' };
    if (!ALLOWED_EXTERNAL_ACTIONS.has(action)) return { blocked: true, reason: 'unsupported_action' };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { blocked: true, reason: 'invalid_payload' };
    }
    return { blocked: false };
  }

  return { blocked: false };
}

const COS_TOOLS = [
  {
    type: 'function',
    name: 'delegate_harness_team',
    description:
      '내부 multi-persona harness team에 작업을 분배한다. founder와 대화하며 scope를 네가 스스로 구체화·락인한 뒤, 필요하다고 판단할 때만 호출한다.',
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
      'Cursor, GitHub, Supabase, Vercel, Railway 등 외부 도구가 필요하고, 네가 scope를 충분히 락인했다고 판단할 때만 호출한다. founder에게 tool 이름·내부 페이로드를 그대로 노출하지 않는다.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: ['cursor', 'github', 'supabase', 'vercel', 'railway'],
          description: '호출할 외부 도구',
        },
        action: {
          type: 'string',
          enum: [
            'plan',
            'create_spec',
            'emit_patch',
            'create_issue',
            'open_pr',
            'apply_sql',
            'deploy',
            'inspect_logs',
          ],
          description: '수행할 액션',
        },
        payload: {
          type: 'object',
          additionalProperties: true,
          description: '도구별 인자 (빈 객체도 허용)',
        },
      },
      required: ['tool', 'action', 'payload'],
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
    '한국어 자연어로 답하라. founder와 대화하며 scope를 스스로 구체화하라. 더 필요한 정보가 있으면 질문하라.',
    '충분히 락인됐다고 네가 판단하기 전에는 delegate_harness_team / invoke_external_tool 을 호출하지 마라.',
    '충분히 락인되면 필요한 tool-call을 스스로 선택하라. 락인 여부는 오직 네 판단이며 앱 코드는 관여하지 않는다.',
    '도구 호출 내용·원시 JSON·내부 메커니즘을 founder에게 설명하거나 그대로 보여주지 말고, 자연어로 결과만 요약한다.',
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
      const schema = validateToolCallArgs(call.name, args);
      if (schema.blocked) {
        result = { ok: false, blocked: true, reason: schema.reason };
      } else if (call.name === 'delegate_harness_team') {
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
