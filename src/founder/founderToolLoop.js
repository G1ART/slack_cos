/**
 * Founder COS — OpenAI Responses tool loop (function_call rounds).
 */

import { getActiveRunForThread } from './executionRunStore.js';
import { resolveOpsSmokeSessionIdForToolAudit } from './smokeOps.js';
import { COS_TOOLS } from './toolPlane/cosFounderToolDefinitions.js';
import { executeFounderCosToolCall } from './toolPlane/executeFounderCosToolCall.js';

const MAX_TOOL_ROUNDS = 8;

/**
 * @param {import('openai').default} openai
 * @param {string} model
 * @param {string} instructions
 * @param {string} initialInput
 * @param {string} threadKey
 * @param {{ founderRequestSummary?: string }} [loopExtras]
 */
export async function runFounderToolLoop(openai, model, instructions, initialInput, threadKey, loopExtras = {}) {
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
