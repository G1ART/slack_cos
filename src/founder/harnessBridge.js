/**
 * COS 뒤 Harness 분배 — canonical spec + dispatch artifact (founder 비노출).
 */

import crypto from 'node:crypto';

const PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/**
 * @param {Record<string, unknown>} payload
 */
export async function runHarnessOrchestration(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const objective = String(p.objective || '').trim();
  const rawPersonas = Array.isArray(p.personas) ? p.personas : [];
  const personas = [
    ...new Set(
      rawPersonas
        .map((x) => String(x).toLowerCase().trim())
        .filter((x) => PERSONA_ENUM.has(x)),
    ),
  ];
  const tasks = Array.isArray(p.tasks) ? p.tasks.map((t) => String(t).trim()).filter(Boolean) : [];
  const deliverables = Array.isArray(p.deliverables)
    ? p.deliverables.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const constraints = Array.isArray(p.constraints)
    ? p.constraints.map((t) => String(t).trim()).filter(Boolean)
    : [];

  /** @type {{ persona: string, mission: string }[]} */
  const team_plan = [];
  const plist = personas.length ? personas : objective ? ['pm'] : [];
  for (let i = 0; i < plist.length; i += 1) {
    const persona = plist[i];
    team_plan.push({
      persona,
      mission: tasks[i] || objective || `역할: ${persona}`,
    });
  }

  const dispatch_id = `harness_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  return {
    ok: true,
    mode: 'harness_dispatch',
    dispatch_id,
    status: 'accepted',
    personas: plist,
    objective,
    tasks,
    deliverables,
    constraints,
    team_plan,
    next_step: 'cursor_spec_emit',
  };
}
