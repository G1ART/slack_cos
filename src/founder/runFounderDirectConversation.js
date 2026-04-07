/**
 * Founder 대화: thread raw memory + execution ledger + Responses API tool loop.
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool, isValidToolAction } from './toolsBridge.js';
import { appendExecutionArtifact, readRecentExecutionArtifacts } from './executionLedger.js';

export { runHarnessOrchestration, invokeExternalTool };

const MAX_TOOL_ROUNDS = 8;

const ALLOWED_EXTERNAL_TOOLS = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

const INVOKE_ACTION_ENUM = [
  'create_spec',
  'emit_patch',
  'create_issue',
  'open_pr',
  'apply_sql',
  'deploy',
  'inspect_logs',
];

const PERSONA_ENUM_ARR = ['research', 'pm', 'engineering', 'design', 'qa', 'data'];

/**
 * @param {{ type: string, summary?: string, payload?: object }} a
 */
export function summarizeExecutionArtifact(a) {
  const pl = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? a.payload : {};
  const type = String(a.type || '');
  if (type === 'harness_dispatch') {
    const shape = pl.team_shape || '?';
    const obj = String(pl.objective || a.summary || '').slice(0, 120);
    return `- harness_dispatch: ${shape} / objective: ${obj}`;
  }
  if (type === 'harness_packet') {
    return `- harness_packet: ${pl.persona || '?'} → ${String(pl.handoff_to || '(end)')} / ${String(pl.mission || '').slice(0, 80)}`;
  }
  if (type === 'tool_invocation') {
    return `- tool_invocation: ${pl.tool}.${pl.action} / ${pl.execution_mode || 'artifact'} mode`;
  }
  if (type === 'tool_result') {
    return `- tool_result: ${pl.tool || '?'}.${pl.action || '?'} / ${String(a.summary || '').slice(0, 120)}`;
  }
  if (type === 'execution_note') {
    return `- execution_note: ${String(a.summary || '').slice(0, 200)}`;
  }
  return `- ${type}: ${String(a.summary || '').slice(0, 120)}`;
}

/**
 * Tool-call 인자의 기계적 스키마 검증만.
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
    if (a.packets !== undefined) {
      if (!Array.isArray(a.packets)) return { blocked: true, reason: 'invalid_payload' };
      for (const pkt of a.packets) {
        if (!pkt || typeof pkt !== 'object' || Array.isArray(pkt)) {
          return { blocked: true, reason: 'invalid_payload' };
        }
        const persona = String(pkt.persona || '').toLowerCase();
        if (!PERSONA_ENUM_ARR.includes(persona)) return { blocked: true, reason: 'invalid_payload' };
        if (typeof pkt.mission !== 'string' || !pkt.mission.trim()) return { blocked: true, reason: 'invalid_payload' };
        if (!Array.isArray(pkt.deliverables) || !Array.isArray(pkt.definition_of_done)) {
          return { blocked: true, reason: 'invalid_payload' };
        }
        if (typeof pkt.handoff_to !== 'string') return { blocked: true, reason: 'invalid_payload' };
        if (typeof pkt.artifact_format !== 'string' || !pkt.artifact_format.trim()) {
          return { blocked: true, reason: 'invalid_payload' };
        }
      }
    }
    return { blocked: false };
  }

  if (callName === 'invoke_external_tool') {
    const tool = a.tool;
    const action = String(a.action || '').trim();
    const payload = a.payload;
    if (!ALLOWED_EXTERNAL_TOOLS.has(tool)) return { blocked: true, reason: 'unsupported_tool' };
    if (!isValidToolAction(tool, action)) return { blocked: true, reason: 'unsupported_action' };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { blocked: true, reason: 'invalid_payload' };
    }
    return { blocked: false };
  }

  if (callName === 'record_execution_note') {
    const note = a.note;
    if (typeof note !== 'string' || !note.trim()) return { blocked: true, reason: 'invalid_payload' };
    return { blocked: false };
  }

  if (callName === 'read_execution_context') {
    const lim = a.limit;
    if (lim !== undefined && lim !== null && (typeof lim !== 'number' || lim < 1 || lim > 20)) {
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
      'Harness 팀 조직·task packet 봉투. team shape·handoff·review 리듬은 네가 최적화한다. founder에게 원시 artifact를 보이지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: '달성 목표 한 줄' },
        personas: {
          type: 'array',
          items: {
            type: 'string',
            enum: PERSONA_ENUM_ARR,
          },
          description: '투입 페르소나',
        },
        tasks: { type: 'array', items: { type: 'string' }, description: '세부 작업 목록' },
        deliverables: { type: 'array', items: { type: 'string' }, description: '기대 산출물' },
        constraints: { type: 'array', items: { type: 'string' }, description: '제약·가정' },
        success_criteria: {
          type: 'array',
          items: { type: 'string' },
          description: '선택: 성공 기준',
        },
        risks: { type: 'array', items: { type: 'string' }, description: '선택: 리스크' },
        packets: {
          type: 'array',
          description: '선택: COS가 직접 설계한 packet 봉투(미제공 시 페르소나·태스크로만 봉투 정리)',
          items: {
            type: 'object',
            properties: {
              packet_id: { type: 'string' },
              persona: { type: 'string', enum: PERSONA_ENUM_ARR },
              mission: { type: 'string' },
              inputs: { type: 'array', items: { type: 'string' } },
              deliverables: { type: 'array', items: { type: 'string' } },
              definition_of_done: { type: 'array', items: { type: 'string' } },
              handoff_to: { type: 'string' },
              artifact_format: { type: 'string' },
            },
            required: ['persona', 'mission', 'deliverables', 'definition_of_done', 'handoff_to', 'artifact_format'],
            additionalProperties: false,
          },
        },
      },
      required: ['objective'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'invoke_external_tool',
    description:
      '외부 도구. 도구별 허용 action만 사용한다. founder 표면은 자연어 하나만 유지한다.',
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
          enum: INVOKE_ACTION_ENUM,
          description:
            'cursor: create_spec|emit_patch · github: create_issue|open_pr · supabase: apply_sql · vercel: deploy · railway: inspect_logs|deploy',
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
  {
    type: 'function',
    name: 'record_execution_note',
    description:
      '내부 실행 메모(예: packet 좁히기, 페르소나 과사용). founder 비노출. COS가 visibility 보고 조율한다.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: '한 줄 요약 (내부용)' },
        detail: { type: 'object', additionalProperties: true, description: '선택: 구조화 디테일' },
      },
      required: ['note'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_execution_context',
    description: '최근 execution ledger를 다시 읽는다.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '최대 개수 (1–20), 생략 시 5' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

/**
 * @param {string} constitutionMarkdown
 */
export function buildSystemInstructions(constitutionMarkdown) {
  return [
    '당신은 G1 COS다. Slack의 founder와 자연어로 대화하고, scope 락 이후 Harness·Tools 실행층을 네가 지휘한다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법에 나온 금지 문자열·레거시 표면을 founder에게 출력하지 마라.',
    'founder와 대화하며 scope를 스스로 구체화하라. lock이 충분하지 않으면 질문하라.',
    'lock이 충분하면 필요한 harness 조직(delegate_harness_team)과 외부 도구(invoke_external_tool)를 스스로 선택하라. harness team shape와 review 리듬은 네가 최적화한다.',
    'record_execution_note / read_execution_context 로 내부 실행 맥락을 정리·재확인할 수 있다.',
    'founder에게 내부 조직·도구·packet·원시 artifact를 직접 보여주지 말라. founder에게는 자연어 응답 하나만 보인다.',
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
 *   executionArtifacts?: { ts: string, type: string, summary: string, payload?: object }[],
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
  lines.push('[최근 실행 아티팩트]');
  const arts = p.executionArtifacts || [];
  if (!arts.length) lines.push('(없음)');
  else {
    for (const a of arts) {
      lines.push(summarizeExecutionArtifact(a));
    }
  }
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
 * @param {Record<string, unknown>} args
 * @param {string} threadKey
 */
async function handleRecordExecutionNote(args, threadKey) {
  if (!threadKey) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const note = String(args?.note || '').trim();
  if (!note) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const detail =
    args?.detail && typeof args.detail === 'object' && !Array.isArray(args.detail) ? args.detail : {};
  await appendExecutionArtifact(threadKey, {
    type: 'execution_note',
    summary: note.slice(0, 500),
    payload: detail,
  });
  return { ok: true, recorded: true };
}

/**
 * @param {Record<string, unknown>} args
 * @param {string} threadKey
 */
async function handleReadExecutionContext(args, threadKey) {
  const limRaw = args?.limit;
  const limit =
    typeof limRaw === 'number' && limRaw >= 1 ? Math.min(20, limRaw) : 5;
  const list = threadKey ? await readRecentExecutionArtifacts(threadKey, limit) : [];
  return { ok: true, artifacts: list };
}

/**
 * @param {import('openai').default} openai
 * @param {string} model
 * @param {string} instructions
 * @param {string} initialInput
 * @param {string} threadKey
 */
async function runToolLoop(openai, model, instructions, initialInput, threadKey) {
  const tk = String(threadKey || '');
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
        result = await runHarnessOrchestration(args, { threadKey: tk });
      } else if (call.name === 'invoke_external_tool') {
        result = await invokeExternalTool(args, { threadKey: tk });
      } else if (call.name === 'record_execution_note') {
        result = await handleRecordExecutionNote(args, tk);
      } else if (call.name === 'read_execution_context') {
        result = await handleReadExecutionContext(args, tk);
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
 *   threadKey: string,
 * }} ctx
 */
export async function runFounderDirectConversation(ctx) {
  const tk = String(ctx.threadKey || '');
  const executionArtifacts = tk ? await readRecentExecutionArtifacts(tk, 5) : [];

  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const initialInput = buildFounderConversationInput({
    recentTurns: ctx.recentTurns || [],
    userText: ctx.userText,
    attachmentResults: ctx.attachmentResults || [],
    metadata: ctx.metadata || {},
    executionArtifacts,
  });

  const { text } = await runToolLoop(ctx.openai, ctx.model, instructions, initialInput, tk);

  console.info(
    JSON.stringify({
      stage: 'cos_turn',
      constitution_sha256: ctx.constitutionSha256,
      output_chars: text.length,
    }),
  );

  return { text };
}
