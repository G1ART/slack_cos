/**
 * 외부 툴 호출 envelope (실 API 연동 전 단계).
 *
 * @param {Record<string, unknown>} spec
 */
export async function invokeExternalTool(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  return {
    ok: true,
    mode: 'external_tool_invocation',
    tool: s.tool,
    action: String(s.action || ''),
    payload: s.payload && typeof s.payload === 'object' ? s.payload : {},
    requires_followup: true,
  };
}
