/**
 * COS 뒤 Harness 분배 envelope. founder에게 직접 노출하지 않는다.
 *
 * @param {Record<string, unknown>} payload
 */
export async function runHarnessOrchestration(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    ok: true,
    mode: 'harness_dispatch',
    personas: Array.isArray(p.personas) ? p.personas : [],
    objective: String(p.objective || ''),
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
    constraints: Array.isArray(p.constraints) ? p.constraints : [],
  };
}
