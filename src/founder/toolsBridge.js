/**
 * Cursor / GitHub / Supabase / Vercel / Railway 등 외부 툴 호출 브리지.
 * permission / lineage / truth boundary는 여기서만 처리한다 (향후 구현).
 *
 * @param {Record<string, unknown>} _spec
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function invokeExternalTool(_spec) {
  return { ok: false, detail: 'toolsBridge_stub_not_configured' };
}
