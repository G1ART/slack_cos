/**
 * 외부 툴 adapter registry — canExecuteLive / executeLive / buildArtifact (얇은 실행기).
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from './executionLedger.js';

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

/** 도구별 허용 action (COS가 조합 선택; 코드는 기계적 검증만) */
export const TOOL_ALLOWED_ACTIONS = {
  cursor: new Set(['create_spec', 'emit_patch']),
  github: new Set(['create_issue', 'open_pr']),
  supabase: new Set(['apply_sql']),
  vercel: new Set(['deploy']),
  railway: new Set(['inspect_logs', 'deploy']),
};

/** @param {string} tool @param {string} action */
export function isValidToolAction(tool, action) {
  const a = String(action || '').trim();
  const set = TOOL_ALLOWED_ACTIONS[tool];
  return !!set && set.has(a);
}

/** @param {{ tool: string, action?: string }} spec */
export function canExecuteLive(spec) {
  const tool = spec.tool;
  const action = String(spec.action || '').trim();
  if (!TOOL_ENUM.has(tool) || !isValidToolAction(tool, action)) return false;
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
 * @param {{ tool: string, action: string, payload?: object }} spec
 * @returns {Promise<{ ok: boolean, summary: string }>}
 */
export async function executeLive(spec) {
  const tool = spec.tool;
  const action = String(spec.action || '').trim();
  return {
    ok: true,
    summary: `live: ${tool}/${action} — credential OK; 이 빌드에서는 비파괴 스텁만 수행`,
  };
}

/**
 * @param {{ tool: string, action: string, payload?: object }} spec
 * @param {string} invocation_id
 */
export function buildArtifact(spec, invocation_id) {
  return {
    ok: true,
    summary: `artifact: ${spec.tool}/${spec.action} — credential 없음, invocation ${invocation_id} 기록`,
  };
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
  if (!isValidToolAction(tool, action)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_action',
      mode: 'external_tool_invocation',
    };
  }

  const invocation_id = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const live = canExecuteLive({ tool, action });

  let execution_mode = 'artifact';
  let result_summary = buildArtifact({ tool, action, payload }, invocation_id).summary;

  if (live) {
    execution_mode = 'live';
    const lr = await executeLive({ tool, action, payload });
    result_summary = lr.summary;
  }

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
      summary: `${invocation_id} ${tool}/${action} / ${execution_mode}`,
      payload: { tool, action, execution_mode, invocation_id },
    });
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: result_summary.slice(0, 500),
      payload: { invocation_id, tool, action, execution_mode },
    });
  }

  return result;
}
