/**
 * 외부 툴 호출 artifact (실 API 전 단계에서도 spec을 고정 기록).
 */

import crypto from 'node:crypto';

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);
const ACTION_ENUM = new Set([
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
 * @param {Record<string, unknown>} spec
 */
export async function invokeExternalTool(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
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

  return {
    ok: true,
    mode: 'external_tool_invocation',
    tool,
    action,
    invocation_id,
    accepted: true,
    payload,
    next_required_input: null,
  };
}
