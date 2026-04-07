/**
 * delegate accepted 이후 동일 tool 라운드에서 첫 runnable packet → invoke_external_tool (기능 상태 트리거만).
 */

import { invokeExternalTool, isValidToolAction } from './toolsBridge.js';

/** @param {Record<string, unknown>} dispatch */
export function orderPacketsByHandoff(dispatch) {
  const packets = Array.isArray(dispatch.packets) ? dispatch.packets : [];
  const order = Array.isArray(dispatch.handoff_order) ? dispatch.handoff_order.map(String) : [];
  /** @type {Record<string, object>} */
  const by = {};
  for (const p of packets) {
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const persona = String(p.persona || '').trim();
      if (persona) by[persona] = p;
    }
  }
  const out = [];
  for (const persona of order) {
    if (by[persona]) out.push(by[persona]);
  }
  for (const p of packets) {
    if (p && typeof p === 'object' && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * @param {object} pkt
 * @returns {Record<string, unknown>}
 */
export function buildInvokePayloadForPacket(pkt) {
  const mission = String(pkt.mission || '').slice(0, 800);
  const dels = Array.isArray(pkt.deliverables) ? pkt.deliverables.map((x) => String(x)).join('\n') : '';
  const tool = pkt.preferred_tool;
  const action = String(pkt.preferred_action || '').trim();

  if (tool === 'cursor' && action === 'create_spec') {
    return { title: mission.slice(0, 200) || 'COS spec', body: dels || mission || '(empty)' };
  }
  if (tool === 'cursor' && action === 'emit_patch') {
    return {
      title: mission.slice(0, 200) || 'patch',
      body: `# Patch context\n\n${mission}\n\n${dels}`,
      content: `${mission}\n${dels}`,
      markdown: `${mission}\n${dels}`,
    };
  }
  if (tool === 'github' && action === 'create_issue') {
    return { title: mission.slice(0, 200) || 'issue', body: `${mission}\n\n${dels}` };
  }
  if (tool === 'github' && action === 'open_pr') {
    return { title: mission.slice(0, 120), head: 'develop', base: 'main' };
  }
  if (tool === 'supabase' && action === 'apply_sql') {
    return { sql: `-- ${mission.slice(0, 200)}\nselect 1;\n` };
  }
  if (tool === 'railway') {
    return {
      deployment_id: String(process.env.RAILWAY_DEPLOYMENT_ID || '').trim(),
    };
  }
  if (tool === 'vercel' && action === 'deploy') {
    return { project: mission.slice(0, 80) };
  }
  return { title: mission.slice(0, 200), body: dels || mission };
}

/**
 * @param {Record<string, unknown>} dispatch
 * @param {NodeJS.ProcessEnv} env
 * @param {string} threadKey
 * @returns {{ packet: object, tool: string, action: string, payload: Record<string, unknown> } | null}
 */
export function pickFirstStarterPacket(dispatch, _env, _threadKey) {
  const ordered = orderPacketsByHandoff(dispatch);
  for (const pkt of ordered) {
    if (!pkt || typeof pkt !== 'object') continue;
    const ps = pkt.packet_status;
    if (ps === 'draft') continue;
    const tool = pkt.preferred_tool;
    const action = String(pkt.preferred_action || '').trim();
    if (!tool || !action || !isValidToolAction(tool, action)) continue;
    const payload = buildInvokePayloadForPacket(pkt);
    return { packet: pkt, tool, action, payload };
  }
  return null;
}

export const __starterKickoffTestHooks = {
  /** @type {typeof invokeExternalTool | null} */
  invokeFn: null,
};

/**
 * @param {{
 *   threadKey: string,
 *   dispatch: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} ctx
 */
export async function executeStarterKickoffIfEligible(ctx) {
  const threadKey = String(ctx.threadKey || '');
  const dispatch = ctx.dispatch && typeof ctx.dispatch === 'object' ? ctx.dispatch : {};
  const env = ctx.env || process.env;

  if (!threadKey) return null;
  if (!dispatch.ok || String(dispatch.status || '') !== 'accepted') return null;

  const pick = pickFirstStarterPacket(dispatch, env, threadKey);
  if (!pick) {
    return { executed: false, reason: 'no_runnable_packet' };
  }

  const inv = __starterKickoffTestHooks.invokeFn || invokeExternalTool;
  const spec = { tool: pick.tool, action: pick.action, payload: pick.payload };
  const outcome = await inv(spec, { threadKey });

  return {
    executed: true,
    tool: pick.tool,
    action: pick.action,
    packet_id: pick.packet?.packet_id != null ? String(pick.packet.packet_id) : null,
    outcome,
  };
}
