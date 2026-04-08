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
  computeExecutionOutcomeCounts,
  readReviewQueue,
} from './executionLedger.js';
import {
  persistAcceptedRunShell,
  finalizeRunAfterStarterKickoff,
  persistRunAfterDelegate,
  getActiveRunForThread,
} from './executionRunStore.js';
import { executeStarterKickoffIfEligible } from './starterLadder.js';
import { stashDelegateEmitPatchContext } from './delegateEmitPatchStash.js';
import { resolveOpsSmokeSessionIdForToolAudit } from './smokeOps.js';
import { recordCosPretriggerAudit } from './pretriggerAudit.js';
import { validateDelegateHarnessTeamToolArgs } from './delegateHarnessPacketValidate.js';

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
 * @returns {{ blocked: boolean, reason?: string, machine_hint?: string, missing_required_fields?: string[] }}
 */
export function validateToolCallArgs(callName, args) {
  const a = args && typeof args === 'object' ? args : {};

  if (callName === 'delegate_harness_team') {
    return validateDelegateHarnessTeamToolArgs(a);
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
    const d = a.detail;
    if (d !== undefined && d !== null && typeof d !== 'string') return { blocked: true, reason: 'invalid_payload' };
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

/** nullable 배열 (strict에서 선택 필드) */
const NULLABLE_STRING_ARRAY = {
  anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
};

const NULLABLE_PERSONA_ARRAY = {
  anyOf: [{ type: 'array', items: { type: 'string', enum: PERSONA_ENUM_ARR } }, { type: 'null' }],
};

const DELEGATE_HARNESS_REQUIRED_KEYS = [
  'objective',
  'personas',
  'tasks',
  'deliverables',
  'constraints',
  'success_criteria',
  'risks',
  'review_checkpoints',
  'open_questions',
  'packets',
];

const DELEGATE_PACKET_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    packet_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'optional stable packet id',
    },
    persona: {
      type: 'string',
      enum: PERSONA_ENUM_ARR,
      description: 'packet owner persona',
    },
    mission: { type: 'string', description: 'packet mission' },
    inputs: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description: 'inputs; null for defaults',
    },
    deliverables: {
      type: 'array',
      items: { type: 'string' },
      description: 'deliverables',
    },
    definition_of_done: {
      type: 'array',
      items: { type: 'string' },
      description: 'definition of done',
    },
    handoff_to: { type: 'string', description: 'next persona or empty string' },
    artifact_format: { type: 'string', description: 'artifact format key' },
    preferred_tool: {
      anyOf: [{ type: 'string', enum: PREFERRED_TOOL_ENUM }, { type: 'null' }],
      description: 'preferred tool or null',
    },
    preferred_action: {
      anyOf: [{ type: 'string', enum: INVOKE_ACTION_ENUM }, { type: 'null' }],
      description: 'preferred action or null',
    },
    review_required: {
      anyOf: [{ type: 'boolean' }, { type: 'null' }],
      description: 'review gate or null',
    },
    review_focus: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description: 'review focus topics or null',
    },
    packet_status: {
      anyOf: [{ type: 'string', enum: ['draft', 'ready'] }, { type: 'null' }],
      description: 'draft|ready or null',
    },
    live_patch: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: 'single repo-relative path' },
            operation: { type: 'string', enum: ['create', 'replace'], description: 'file operation' },
            content: { type: 'string', description: 'full exact file content' },
            live_only: { type: 'boolean', description: 'must be true for narrow automation' },
            no_fallback: { type: 'boolean', description: 'must be true for narrow automation' },
          },
          required: ['path', 'operation', 'content', 'live_only', 'no_fallback'],
        },
        { type: 'null' },
      ],
      description: 'closed single-file patch or null',
    },
  },
  required: [
    'packet_id',
    'persona',
    'mission',
    'inputs',
    'deliverables',
    'definition_of_done',
    'handoff_to',
    'artifact_format',
    'preferred_tool',
    'preferred_action',
    'review_required',
    'review_focus',
    'packet_status',
    'live_patch',
  ],
};

const COS_TOOLS = [
  {
    type: 'function',
    name: 'delegate_harness_team',
    description:
      'Harness 내부 실행 조직·work packet. 대부분은 packets=null로 두고 서버가 objective·페르소나로 envelope를 만든다. 아주 좁게 닫힌 단일 파일 live patch(create|replace, exact content, live_only+no_fallback)만 packets에 live_patch를 실을 수 있다. founder에게 원시 artifact를 보이지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: '달성 목표 한 줄' },
        personas: {
          ...NULLABLE_PERSONA_ARRAY,
          description: '투입 페르소나; 없으면 null',
        },
        tasks: { ...NULLABLE_STRING_ARRAY, description: '세부 작업; 없으면 null' },
        deliverables: { ...NULLABLE_STRING_ARRAY, description: '기대 산출물; 없으면 null' },
        constraints: { ...NULLABLE_STRING_ARRAY, description: '제약·가정; 없으면 null' },
        success_criteria: { ...NULLABLE_STRING_ARRAY, description: '성공 기준; 없으면 null' },
        risks: { ...NULLABLE_STRING_ARRAY, description: '리스크; 없으면 null' },
        review_checkpoints: { ...NULLABLE_STRING_ARRAY, description: '리뷰 체크포인트; 없으면 null' },
        open_questions: { ...NULLABLE_STRING_ARRAY, description: '미결 질문; 없으면 null' },
        packets: {
          anyOf: [{ type: 'array', items: DELEGATE_PACKET_ITEM_SCHEMA }, { type: 'null' }],
          description:
            '선택 패킷 배열 또는 null. live_patch 사용 시 단일 경로·exact content·live_only·no_fallback 필수.',
        },
      },
      required: DELEGATE_HARNESS_REQUIRED_KEYS,
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'invoke_external_tool',
    description:
      '외부 도구. live가 불가하면 artifact fallback. 불필요한 남발 없이 최소 호출. founder 표면은 자연어만.',
    strict: false,
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
        detail: {
          anyOf: [
            {
              type: 'string',
              description: '선택 구조화 디테일(JSON 객체를 문자열로) 또는 빈 문자열; 없으면 null',
            },
            { type: 'null' },
          ],
          description: 'JSON 문자열 또는 null(OpenAI strict 호환)',
        },
      },
      required: ['note', 'detail'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_execution_context',
    description:
      '최근 ledger 요약·raw artifact·adapter readiness·review_queue·실행 집계(review_required/degraded/blocked/failed 카운트). founder에게 그대로 노출하지 말 것.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          anyOf: [{ type: 'integer', minimum: 1, maximum: 20 }, { type: 'null' }],
          description: '최대 개수 (1–20); 기본 5는 null',
        },
      },
      required: ['limit'],
      additionalProperties: false,
    },
  },
];

/**
 * OpenAI Responses `strict: true` 도구 스키마: 각 object 노드에서 properties 키 전부가 required에 있어야 함.
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @returns {string[]}
 */
export function collectOpenAiStrictSchemaViolations(schema, path = 'root') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const out = [];
  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const keys = Object.keys(schema.properties);
    if (keys.length > 0 && schema.additionalProperties !== false) {
      out.push(`${path}: object with properties must set additionalProperties: false (OpenAI strict)`);
    }
    const req = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const k of keys) {
      if (!req.has(k)) out.push(`${path}: missing "${k}" in required (OpenAI strict)`);
    }
    for (const k of keys) {
      const child = schema.properties[k];
      out.push(...collectOpenAiStrictSchemaViolations(child, `${path}.${k}`));
    }
  }
  if (schema.items) {
    out.push(...collectOpenAiStrictSchemaViolations(schema.items, `${path}[items]`));
  }
  if (Array.isArray(schema.anyOf)) {
    for (let i = 0; i < schema.anyOf.length; i += 1) {
      const branch = schema.anyOf[i];
      if (branch && typeof branch === 'object' && branch.type === 'null') continue;
      out.push(...collectOpenAiStrictSchemaViolations(branch, `${path}.anyOf[${i}]`));
    }
  }
  return out;
}

/** strict:true 인 COS_TOOLS만 검사 — CI·회귀용 */
export function getOpenAiStrictViolationsForCosTools() {
  const errs = [];
  for (const t of COS_TOOLS) {
    if (t.type !== 'function' || !t.strict || !t.parameters) continue;
    errs.push(...collectOpenAiStrictSchemaViolations(t.parameters, `tool:${t.name}.parameters`));
  }
  return errs;
}

/** @returns {Record<string, unknown> | null} */
export function getDelegateHarnessTeamParametersSnapshot() {
  const t = COS_TOOLS.find((x) => x.type === 'function' && x.name === 'delegate_harness_team');
  return t && t.parameters && typeof t.parameters === 'object' ? t.parameters : null;
}

/**
 * Boot log helper — same keys as app.js `cos_boot_delegate_schema` (without deploy_sha).
 */
export function getDelegateBootSchemaSnapshot() {
  const dhProps = getDelegateHarnessTeamParametersSnapshot()?.properties;
  const delegateKeys =
    dhProps && typeof dhProps === 'object' && !Array.isArray(dhProps) ? Object.keys(dhProps).sort() : [];
  return {
    delegate_parameter_keys: delegateKeys,
    delegate_schema_includes_packets: delegateKeys.includes('packets'),
  };
}

/**
 * Founder-facing copy when tools failed validation/contract (machine hints only; no speculation).
 * @param {unknown[]} parsedToolResults
 */
export function formatFounderSafeToolBlockMessage(parsedToolResults) {
  const lines = [];
  const arr = Array.isArray(parsedToolResults) ? parsedToolResults : [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (r);
    if (o.blocked === true && o.reason === 'invalid_payload') {
      if (o.machine_hint) lines.push(String(o.machine_hint));
      if (Array.isArray(o.missing_required_fields)) {
        for (const f of o.missing_required_fields.slice(0, 16)) {
          lines.push(`emit_patch required field missing: ${String(f)}`);
        }
      }
      if (Array.isArray(o.emit_patch_machine_hints)) {
        for (const h of o.emit_patch_machine_hints.slice(0, 12)) lines.push(String(h));
      }
    }
    if (o.degraded_from === 'emit_patch_cloud_contract_not_met') {
      if (Array.isArray(o.missing_required_fields)) {
        for (const f of o.missing_required_fields.slice(0, 16)) {
          lines.push(`emit_patch required field missing: ${String(f)}`);
        }
      }
      if (Array.isArray(o.emit_patch_machine_hints)) {
        for (const h of o.emit_patch_machine_hints.slice(0, 12)) lines.push(String(h));
      }
    }
  }
  const unique = [...new Set(lines.map((x) => String(x).trim()).filter(Boolean))];
  const detail =
    unique.length > 0
      ? unique.map((l) => `· ${l.slice(0, 220)}`).join('\n')
      : '· invalid_payload (validator rejected; exact missing field not captured)';
  return `요청을 처리하는 중 도구 입력이 검증에 막혔습니다.\n${detail}\n범위를 좁히거나 필요한 필드를 채운 뒤 다시 보내 주시면 이어서 진행하겠습니다.`;
}

/**
 * @param {unknown[]} parsedToolResults
 */
export function shouldReplaceFounderTextWithSafeToolBlockMessage(parsedToolResults) {
  const arr = Array.isArray(parsedToolResults) ? parsedToolResults : [];
  return arr.some((r) => {
    if (!r || typeof r !== 'object') return false;
    const o = /** @type {Record<string, unknown>} */ (r);
    if (o.blocked === true && o.reason === 'invalid_payload') return true;
    if (o.degraded_from === 'emit_patch_cloud_contract_not_met') return true;
    return false;
  });
}

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
    'starter(첫 패킷 자동 실행)가 실제로 돌아간 경우에는 “곧 시작합니다” 같은 약속형보다, 도구 호출 결과·ledger에 근거한 사실만 말한다.',
    'founder에게 Node·OS 수준 오류(예: ENOENT, errno, 절대경로 열기 실패) 형식의 메시지를 출력하지 마라. 그런 문자열은 앱 표면이 아니다.',
    '채널·스레드 식별자는 이미 입력 블록([최소 메타], [최근 대화])에 있다. channel-context.json 등 가상 경로를 읽었다고 가정하거나 언급하지 마라.',
    'founder에게 내부 artifact·원시 JSON을 직접 보여주지 말고 자연어로만 보고하라.',
    '[Adapter readiness] 블록은 시스템 입력 전용이다. founder 답변에 인용·복붙하지 말 것.',
    '도구 결과에 blocked·invalid_payload·계약 미충족이 있으면, 원인을 추정하거나 “줄바꿈 때문일 수 있다” 같은 서술을 하지 말고, 도구 출력에 포함된 기계적 설명만 그대로 전달하라. 기계적 설명이 없으면 짧게 막혔음만 알리고 세부 원인을 지어내지 말라.',
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
function parseExecutionNoteDetail(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  const t = raw.trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t);
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

async function handleRecordExecutionNote(args, threadKey) {
  if (!threadKey) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const note = String(args?.note || '').trim();
  if (!note) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const detail = parseExecutionNoteDetail(args?.detail);
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
export async function handleReadExecutionContext(args, threadKey) {
  const limRaw = args?.limit;
  const limit =
    typeof limRaw === 'number' && limRaw >= 1 ? Math.min(20, limRaw) : 5;
  const artifacts = threadKey ? await readRecentExecutionArtifacts(threadKey, limit) : [];
  const summary_lines = threadKey ? await readExecutionSummary(threadKey, limit) : [];
  const adapter_readiness_lines = await formatAdapterReadinessCompactLines(process.env, 6, threadKey);
  const counts = threadKey
    ? await computeExecutionOutcomeCounts(threadKey)
    : {
        review_required_count: 0,
        degraded_count: 0,
        blocked_count: 0,
        failed_count: 0,
      };
  const review_queue = threadKey ? await readReviewQueue(threadKey, limit) : [];
  return {
    ok: true,
    summary_lines,
    artifacts,
    adapter_readiness_lines,
    review_queue,
    review_required_count: counts.review_required_count,
    degraded_count: counts.degraded_count,
    blocked_count: counts.blocked_count,
    failed_count: counts.failed_count,
  };
}

/**
 * @param {import('openai').default} openai
 * @param {string} model
 * @param {string} instructions
 * @param {string} initialInput
 * @param {string} threadKey
 */
/**
 * @param {{ founderRequestSummary?: string }} [loopExtras]
 */
async function runToolLoop(openai, model, instructions, initialInput, threadKey, loopExtras = {}) {
  const tk = String(threadKey || '');
  const founderRequestSummary = String(loopExtras.founderRequestSummary || '');
  let previousResponseId = null;
  /** @type {Array<{ type: 'function_call_output', call_id: string, output: string }> | null} */
  let toolOutputs = null;
  let lastText = '';
  /** @type {unknown[]} */
  let lastToolRoundParsedResults = [];
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

    let res;
    try {
      res = await openai.responses.create(req);
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      const errObj = e && typeof e === 'object' && 'error' in e && e.error && typeof e.error === 'object' ? e.error : null;
      const innerCode = errObj && 'code' in errObj ? String(errObj.code) : '';
      const param = e && typeof e === 'object' && 'param' in e ? String(e.param || '') : '';
      const status = e && typeof e === 'object' && 'status' in e ? Number(e.status) : 0;
      const msg = String(e && typeof e === 'object' && 'message' in e ? e.message : e);
      if (
        innerCode === 'invalid_function_parameters' ||
        code === 'invalid_function_parameters' ||
        /invalid schema for function/i.test(msg) ||
        (status === 400 && /tools?\[/i.test(param))
      ) {
        console.error(
          JSON.stringify({
            category: 'founder_tool_schema_invalid',
            message: msg.slice(0, 500),
            code: innerCode || code,
            param,
            status,
          }),
        );
      }
      throw e;
    }
    previousResponseId = res.id;

    const output = Array.isArray(res.output) ? res.output : [];
    const calls = output.filter((x) => x && x.type === 'function_call');

    if (!calls.length) {
      lastText = String(res.output_text || '').trim();
      if (shouldReplaceFounderTextWithSafeToolBlockMessage(lastToolRoundParsedResults)) {
        lastText = formatFounderSafeToolBlockMessage(lastToolRoundParsedResults);
      }
      break;
    }

    const smTurn = resolveOpsSmokeSessionIdForToolAudit(process.env);
    const activeRun = tk ? await getActiveRunForThread(tk) : null;
    const auditRunId = activeRun?.id != null ? String(activeRun.id) : '';

    const outs = [];
    /** @type {unknown[]} */
    const currentRoundResults = [];
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(String(call.arguments || '{}'));
      } catch {
        args = {};
      }
      let result;
      if (
        smTurn &&
        (call.name === 'delegate_harness_team' || call.name === 'invoke_external_tool')
      ) {
        try {
          await recordCosPretriggerAudit({
            env: process.env,
            threadKey: tk,
            runId: auditRunId,
            smoke_session_id: smTurn,
            call_name: call.name,
            args,
            blocked: false,
          });
        } catch (e) {
          console.error('[pretrigger_audit]', e);
        }
      }
      const schema = validateToolCallArgs(call.name, args);
      if (schema.blocked) {
        result = {
          ok: false,
          blocked: true,
          reason: schema.reason,
          ...(schema.blocked_reason ? { blocked_reason: schema.blocked_reason } : {}),
          ...(schema.machine_hint ? { machine_hint: schema.machine_hint } : {}),
          ...(Array.isArray(schema.missing_required_fields)
            ? { missing_required_fields: schema.missing_required_fields }
            : {}),
          ...(Array.isArray(schema.invalid_enum_fields)
            ? { invalid_enum_fields: schema.invalid_enum_fields }
            : {}),
          ...(Array.isArray(schema.invalid_nested_fields)
            ? { invalid_nested_fields: schema.invalid_nested_fields }
            : {}),
          ...(Array.isArray(schema.delegate_schema_error_fields)
            ? { delegate_schema_error_fields: schema.delegate_schema_error_fields }
            : {}),
        };
        if (
          smTurn &&
          (call.name === 'delegate_harness_team' || call.name === 'invoke_external_tool')
        ) {
          try {
            await recordCosPretriggerAudit({
              env: process.env,
              threadKey: tk,
              runId: auditRunId,
              smoke_session_id: smTurn,
              call_name: call.name,
              args,
              blocked: true,
              machine_hint: schema.machine_hint,
              blocked_reason: schema.blocked_reason || schema.reason,
              missing_required_fields: schema.missing_required_fields,
              invalid_enum_fields: schema.invalid_enum_fields,
              invalid_nested_fields: schema.invalid_nested_fields,
              delegate_schema_valid:
                schema.delegate_schema_valid === true || schema.delegate_schema_valid === false
                  ? schema.delegate_schema_valid
                  : false,
              delegate_schema_error_fields: schema.delegate_schema_error_fields,
            });
          } catch (e) {
            console.error('[pretrigger_audit]', e);
          }
        }
      } else if (call.name === 'delegate_harness_team') {
        result = await runHarnessOrchestration(args, { threadKey: tk });
        if (result && result.ok && String(result.status) === 'accepted' && tk) {
          stashDelegateEmitPatchContext(tk, /** @type {Record<string, unknown>} */ (result));
          const shell = await persistAcceptedRunShell({
            threadKey: tk,
            dispatch: result,
            founder_request_summary: founderRequestSummary,
          });
          const runId = shell?.id != null ? String(shell.id).trim() : '';
          let kick;
          if (runId) {
            kick = await executeStarterKickoffIfEligible({
              threadKey: tk,
              dispatch: result,
              env: process.env,
              cosRunId: runId,
            });
            result = { ...result, starter_kickoff: kick };
            await finalizeRunAfterStarterKickoff({
              runId,
              threadKey: tk,
              dispatch: result,
              starter_kickoff: kick,
              founder_request_summary: founderRequestSummary,
            });
          } else {
            kick = await executeStarterKickoffIfEligible({
              threadKey: tk,
              dispatch: result,
              env: process.env,
            });
            result = { ...result, starter_kickoff: kick };
            await persistRunAfterDelegate({
              threadKey: tk,
              dispatch: result,
              starter_kickoff: kick,
              founder_request_summary: founderRequestSummary,
            });
          }
        }
      } else if (call.name === 'invoke_external_tool') {
        result = await invokeExternalTool(args, {
          threadKey: tk,
          ...(smTurn ? { ops_smoke_session_id: smTurn } : {}),
        });
      } else if (call.name === 'record_execution_note') {
        result = await handleRecordExecutionNote(args, tk);
      } else if (call.name === 'read_execution_context') {
        result = await handleReadExecutionContext(args, tk);
      } else {
        result = { ok: false, error: 'unknown_tool', name: call.name };
      }
      currentRoundResults.push(result);
      outs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    lastToolRoundParsedResults = currentRoundResults;
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
 *   userText?: string,
 * }} ctx
 */
export async function runFounderDirectConversation(ctx) {
  const tk = String(ctx.threadKey || '');
  const executionSummaryLines = tk ? await readExecutionSummary(tk, 5) : [];
  const adapterReadinessLines = await formatAdapterReadinessCompactLines(process.env, 6, tk);

  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const initialInput = buildFounderConversationInput({
    recentTurns: ctx.recentTurns || [],
    userText: ctx.userText,
    attachmentResults: ctx.attachmentResults || [],
    metadata: ctx.metadata || {},
    executionSummaryLines,
    adapterReadinessLines,
  });

  const { text } = await runToolLoop(ctx.openai, ctx.model, instructions, initialInput, tk, {
    founderRequestSummary: String(ctx.userText || '').slice(0, 500),
  });

  console.info(
    JSON.stringify({
      stage: 'cos_turn',
      constitution_sha256: ctx.constitutionSha256,
      output_chars: text.length,
      response_preview: text.slice(0, 160),
    }),
  );

  return { text };
}
