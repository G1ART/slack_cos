/**
 * Founder 대화: thread raw memory + execution ledger + Responses API tool loop.
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool, formatAdapterReadinessCompactLines } from './toolsBridge.js';
import { readExecutionSummary } from './executionLedger.js';
import { getActiveRunForThread } from './executionRunStore.js';
import { resolveOpsSmokeSessionIdForToolAudit } from './smokeOps.js';
import { FOUNDER_COS_PERSONA_HARNESS_BLOCK } from './personaHarnessInstructions.js';
import {
  PERSONA_CONTRACT_MANIFEST_REPO_PATH,
  formatPersonaContractLinesForInstructions,
} from './personaContractOutline.js';
import { COS_TOOLS } from './toolPlane/cosFounderToolDefinitions.js';
import { executeFounderCosToolCall } from './toolPlane/executeFounderCosToolCall.js';

export { runHarnessOrchestration, invokeExternalTool };

export { validateToolCallArgs } from './toolPlane/cosFounderToolValidation.js';
export {
  collectOpenAiStrictSchemaViolations,
  getOpenAiStrictViolationsForCosTools,
  getDelegateHarnessTeamParametersSnapshot,
  getDelegateBootSchemaSnapshot,
} from './toolPlane/cosFounderToolSchemaAudit.js';
export { handleReadExecutionContext } from './founderCosToolHandlers.js';

/**
 * 레거시 상수 — 과거에는 슬랙에 접수 한 줄만 보냄. 현재는 모델 `text`가 슬랙 본문으로 나감.
 * @deprecated 회귀·문서 호환용; 신규 코드는 `runFounderDirectConversation` 의 `text` 사용.
 */
export const FOUNDER_SAME_TURN_ACK_TEXT = '요청을 접수했습니다.';

const MAX_TOOL_ROUNDS = 8;

/**
 * @param {string} constitutionMarkdown
 */
export function buildSystemInstructions(constitutionMarkdown) {
  const personaContractBlock = formatPersonaContractLinesForInstructions();
  return [
    '당신은 G1 COS다. Slack의 founder와 자연어로 대화하고, scope 락 이후 Harness·Tools 실행층을 네가 지휘한다.',
    'founder는 이 Slack 창구를 Lovable류 전용 MVP 빌딩 UI에 가깝게 쓰되, 대화 표면은 COS 한 명·자연어로 유지한다. 여러 제품·레포·프로젝트 스페이스가 동시에 돌아가도 run·packet·콜백 권위 언어를 섞지 말고 테넌시 경계를 흐트러뜨리지 말라.',
    '하네스 팀은 네가 그때그때 조립하는 내부 실행 조직이다. 패킷은 통제용이 아니라 전달용 canonical envelope다.',
    '아래 헌법 전문을 반드시 준수하라. 헌법에 나온 금지 문자열·레거시 표면을 founder에게 출력하지 마라.',
    'founder와 대화하며 scope를 스스로 구체화하라. lock이 충분하지 않으면 질문하라.',
    'lock이 충분하면 harness(delegate_harness_team)와 외부 도구(invoke_external_tool)를 스스로 선택하라. team shape·review 리듬은 네가 최적화한다.',
    '실행 아티팩트·ledger·결과를 보고 과사용·독단·낭비를 스스로 조율하라. 코드는 visibility만 준다.',
    'live adapter가 없거나 계약이 부족하면 artifact fallback을 사용한다. 불필요한 tool 남발 없이 최소 호출로 진행하라.',
    'record_execution_note / read_execution_context 로 내부 맥락을 정리·재확인한다. 앱이 매 턴 주입하지 않으므로(A), 스스로 훈련하듯: ledger 한 줄·[최근 대화]와 실행 상태가 어긋나 보이거나 blocked/복수 런이 겹쳐 보이면 founder에게 서술하기 전 같은 턴에서 read_execution_context 로 정렬한다. 상태를 추정해 채우지 않는다.',
    '반복되는 운영 교훈·실수 패턴은 record_execution_note 에 한 줄(+선택 JSON detail)로만 남긴다. founder 노출·장문 금지.',
    `내부 하네스 페르소나 계약 초안(G1 M2): 레포 ${PERSONA_CONTRACT_MANIFEST_REPO_PATH} 의 version·personas[] 를 delegate_harness_team 조립 시 참고한다.`,
    ...(personaContractBlock
      ? ['', personaContractBlock, '위 블록은 계약 요약이며 team shape·페르소나 선택은 여전히 네가 판단한다.']
      : []),
    'starter(첫 패킷 자동 실행)가 실제로 돌아간 경우에는 “곧 시작합니다” 같은 약속형보다, 도구 호출 결과·ledger에 근거한 사실만 말한다.',
    'founder에게 Node·OS 수준 오류(예: ENOENT, errno, 절대경로 열기 실패) 형식의 메시지를 출력하지 마라. 그런 문자열은 앱 표면이 아니다.',
    '채널·스레드 식별자는 이미 입력 블록([최소 메타], [최근 대화])에 있다. channel-context.json 등 가상 경로를 읽었다고 가정하거나 언급하지 마라.',
    'founder에게 내부 artifact·원시 JSON을 직접 보여주지 말고 자연어로만 보고하라.',
    '[Adapter readiness] 블록은 시스템 입력 전용이다. founder 답변에 인용·복붙하지 말 것.',
    '도구 결과에 blocked·invalid_payload·계약 미충족이 있으면, 원인을 추정하거나 “줄바꿈 때문일 수 있다” 같은 서술을 하지 말고, 도구 출력에 포함된 기계적 설명만 그대로 전달하라. 기계적 설명이 없으면 짧게 막혔음만 알리고 세부 원인을 지어내지 말라.',
    '',
    FOUNDER_COS_PERSONA_HARNESS_BLOCK,
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
 * @param {import('openai').default} openai
 * @param {string} model
 * @param {string} instructions
 * @param {string} initialInput
 * @param {string} threadKey
 * @param {{ founderRequestSummary?: string }} [loopExtras]
 */
async function runToolLoop(openai, model, instructions, initialInput, threadKey, loopExtras = {}) {
  const tk = String(threadKey || '');
  const founderRequestSummary = String(loopExtras.founderRequestSummary || '');
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
      break;
    }

    const smTurn = resolveOpsSmokeSessionIdForToolAudit(process.env);
    const activeRun = tk ? await getActiveRunForThread(tk) : null;
    const auditRunId = activeRun?.id != null ? String(activeRun.id) : '';

    const outs = [];
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(String(call.arguments || '{}'));
      } catch {
        args = {};
      }
      const result = await executeFounderCosToolCall({
        call,
        args,
        threadKey: tk,
        smTurn,
        auditRunId,
        activeRun,
        founderRequestSummary,
      });
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

  return { text, starter_ack: text };
}
