/**
 * 외부 툴 실행 adapter registry — live credential 시 live, 없으면 artifact.
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from './executionLedger.js';

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);
const ACTION_ENUM = new Set([
  'create_spec',
  'emit_patch',
  'create_issue',
  'open_pr',
  'apply_sql',
  'deploy',
  'inspect_logs',
]);

function hasLiveCredential(tool) {
  switch (tool) {
    case 'github':
      return !!String(process.env.GITHUB_TOKEN || '').trim();
    case 'supabase':
      return !!(
        String(process.env.SUPABASE_URL || '').trim() && String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
      );
    case 'cursor':
      return !!String(process.env.CURSOR_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    case 'vercel':
      return !!String(process.env.VERCEL_TOKEN || '').trim();
    case 'railway':
      return !!String(process.env.RAILWAY_TOKEN || '').trim();
    default:
      return false;
  }
}

/**
 * @param {Record<string, unknown>} spec
 * @param {{ threadKey?: string }} [ctx]
 */
export async function invokeExternalTool(spec, ctx = {}) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const threadKey = ctx.threadKey ? String(ctx.threadKey) : '';
  const tool = s.tool;
  const action = String(s.action || '').trim();
  const payload = s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {};

  if (!TOOL_ENUM.has(tool)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_tool',
      mode: 'external_tool_invocation',
    };
  }
  if (!ACTION_ENUM.has(action)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_action',
      mode: 'external_tool_invocation',
    };
  }

  const invocation_id = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const execution_mode = hasLiveCredential(tool) ? 'live' : 'artifact';
  const result_summary =
    execution_mode === 'live'
      ? 'live: credential present; minimal adapter — no destructive remote IO in this build'
      : 'artifact: credential missing — dispatch recorded for downstream adapter';

  const result = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    payload,
    result_summary,
    next_required_input: null,
  };

  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_invocation',
      summary: `${invocation_id} ${tool}/${action}`,
      payload: { tool, action, execution_mode, invocation_id },
    });
    if (execution_mode === 'live') {
      await appendExecutionArtifact(threadKey, {
        type: 'tool_result',
        summary: result_summary.slice(0, 500),
        payload: { invocation_id, tool, action, execution_mode },
      });
    }
  }

  return result;
}
