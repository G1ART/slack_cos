/**
 * COS 뒤의 Harness(multi-persona) 오케스트레이션 최소 브리지.
 * Founder 경로에 직접 끼어들지 않는다.
 *
 * @param {Record<string, unknown>} _payload
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function runHarnessOrchestration(_payload) {
  return { ok: false, detail: 'harnessBridge_stub_not_configured' };
}
