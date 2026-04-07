/**
 * Founder 대화: thread raw memory + execution ledger + Responses API tool loop.
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import {
  invokeExternalTool,
  isValidToolAction,
  formatAdapterReadinessCompactLines,
} from './toolsBridge.js';
import {
  appendExecutionArtifact,
  readExecutionSummary,
  readRecentExecutionArtifacts,
} from './executionLedger.js';

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
const PREFERRED_TOOL_ENUM = ['cursor', 'github', 'supabase', 'vercel', 'railway'];

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
        if (pkt.preferred_tool != null) {
          const pt = String(pkt.preferred_tool);
          if (!PREFERRED_TOOL_ENUM.includes(pt)) return { blocked: true, reason: 'invalid_payload' };
        }
        if (pkt.preferred_action != null) {
          const pa = String(pkt.preferred_action);
          if (!INVOKE_ACTION_ENUM.includes(pa)) return { blocked: true, reason: 'invalid_payload' };
        }
        if (pkt.review_required !== undefined && typeof pkt.review_required !== 'boolean') {
          return { blocked: true, reason: 'invalid_payload' };
        }
        if (pkt.review_focus !== undefined && !Array.isArray(pkt.review_focus)) {
          return { blocked: true, reason: 'invalid_payload' };
        }
        if (
          pkt.packet_status !== undefined &&
          pkt.packet_status !== 'draft' &&
          pkt.packet_status !== 'ready'
        ) {
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

const PACKET_ITEM_PROPERTIES = {
  packet_id: { type: 'string' },
  persona: { type: 'string', enum: PERSONA_ENUM_ARR },
  mission: { type: 'string' },
  inputs: { type: 'array', items: { type: 'string' } },
  deliverables: { type: 'array', items: { type: 'string' } },
  definition_of_done: { type: 'array', items: { type: 'string' } },
  handoff_to: { type: 'string' },
  artifact_format: { type: 'string' },
  preferred_tool: { type: 'string', enum: PREFERRED_TOOL_ENUM },
  preferred_action: { type: 'string', enum: INVOKE_ACTION_ENUM },
  review_required: { type: 'boolean' },
  review_focus: { type: 'array', items: { type: 'string' } },
  packet_status: { type: 'string', enum: ['draft', 'ready'] },
};

const COS_TOOLS = [
  {
    type: 'function',
    name: 'delegate_harness_team',
    description:
      'Harness 내부 실행 조직·work packet. 패킷은 통제용이 아니라 전달용 봉투다. founder에게 원시 artifact를 보이지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: '달성 목표 한 줄' },
        personas: {
          type: 'array',
          items: { type: 'string', enum: PERSONA_ENUM_ARR },
          description: '투입 페르소나',
        },
        tasks: { type: 'array', items: { type: 'string' }, description: '세부 작업 목록' },
        deliverables: { type: 'array', items: { type: 'string' }, description: '기대 산출물' },
        constraints: { type: 'array', items: { type: 'string' }, description: '제약·가정' },
        success_criteria: { type: 'array', items: { type: 'string' }, description: '선택: 성공 기준' },
        risks: { type: 'array', items: { type: 'string' }, description: '선택: 리스크' },
        review_checkpoints: { type: 'array', items: { type: 'string' }, description: '선택: 리뷰 체크포인트' },
        open_questions: { type: 'array', items: { type: 'string' }, description: '선택: 미결 질문' },
        packets: {
          type: 'array',
          description: '선택: COS 설계 packet(미제공 시 자동 봉투+실행기 매핑)',
          items: {
            type: 'object',
            properties: PACKET_ITEM_PROPERTIES,
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
      '외부 도구. live가 불가하면 artifact fallback. 불필요한 남발 없이 최소 호출. founder 표면은 자연어만.',
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
      '내부 운영 메모(예: packet 축소, 페르소나 과사용). founder 비노출. ledger visibility용.',
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
    description:
      '최근 ledger 요약·raw artifact·adapter readiness(호스트 기준 live 가능 여부). founder에게 그대로 노출하지 말 것.',
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
    '하네스 팀은 네가 그때그때 조립하는 내부 실행 조직이다. 패킷은 통제용이 아니라 전달용 canonical envelope다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법에 나온 금지 문자열·레거시 표면을 founder에게 출력하지 마라.',
    'founder와 대화하며 scope를 스스로 구체화하라. lock이 충분하지 않으면 질문하라.',
    'lock이 충분하면 harness(delegate_harness_team)와 외부 도구(invoke_external_tool)를 스스로 선택하라. team shape·review 리듬은 네가 최적화한다.',
    '실행 아티팩트·ledger·결과를 보고 과사용·독단·낭비를 스스로 조율하라. 코드는 visibility만 준다.',
    'live adapter가 없거나 계약이 부족하면 artifact fallback을 사용한다. 불필요한 tool 남발 없이 최소 호출로 진행하라.',
    'record_execution_note / read_execution_context 로 내부 맥락을 정리·재확인한다.',
    'founder에게 내부 artifact·원시 JSON을 직접 보여주지 말고 자연어로만 보고하라.',
    '[Adapter readiness] 블록은 시스템 입력 전용이다. founder 답변에 인용·복붙하지 말 것.',
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
 *   executionSummaryLines?: string[],
 *   adapterReadinessLines?: string[],
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
  const sl = p.executionSummaryLines || [];
  if (!sl.length) lines.push('(없음)');
  else {
    for (const line of sl) lines.push(line);
  }
  const ar = p.adapterReadinessLines;
  if (ar && ar.length) {
    lines.push('');
    lines.push('[Adapter readiness — COS 내부만, founder 응답에 인용 금지]');
    for (const line of ar.slice(0, 6)) lines.push(line);
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
    status: null,
  });
  return { ok: true, recorded: true, summary: note.slice(0, 500) };
}

/**
 * @param {Record<string, unknown>} args
 * @param {string} threadKey
 */
async function handleReadExecutionContext(args, threadKey) {
  const limRaw = args?.limit;
  const limit =
    typeof limRaw === 'number' && limRaw >= 1 ? Math.min(20, limRaw) : 5;
  const artifacts = threadKey ? await readRecentExecutionArtifacts(threadKey, limit) : [];
  const summary_lines = threadKey ? await readExecutionSummary(threadKey, limit) : [];
  const adapter_readiness_lines = await formatAdapterReadinessCompactLines(process.env, 6);
  return { ok: true, summary_lines, artifacts, adapter_readiness_lines };
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
  const executionSummaryLines = tk ? await readExecutionSummary(tk, 5) : [];
  const adapterReadinessLines = await formatAdapterReadinessCompactLines(process.env, 6);

  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const initialInput = buildFounderConversationInput({
    recentTurns: ctx.recentTurns || [],
    userText: ctx.userText,
    attachmentResults: ctx.attachmentResults || [],
    metadata: ctx.metadata || {},
    executionSummaryLines,
    adapterReadinessLines,
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
