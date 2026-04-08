/**
 * delegate accepted 이후 packet 단위 invoke_external_tool (기능 상태 트리거만).
 */

import { invokeExternalTool, isValidToolAction, TOOL_OUTCOME_CODES } from './toolsBridge.js';

/** @typedef {'queued'|'ready'|'running'|'review_required'|'blocked'|'completed'|'failed'|'skipped'} PacketState */

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
    const base = {
      title: mission.slice(0, 200) || 'patch',
      body: `# Patch context\n\n${mission}\n\n${dels}`,
      content: `${mission}\n${dels}`,
      markdown: `${mission}\n${dels}`,
    };
    const lp = pkt.live_patch;
    if (lp && typeof lp === 'object' && !Array.isArray(lp)) {
      return {
        ...base,
        live_patch: {
          path: lp.path != null ? String(lp.path).trim() : '',
          operation: lp.operation != null ? String(lp.operation).trim().toLowerCase() : '',
          content: lp.content != null ? String(lp.content) : '',
        },
      };
    }
    return base;
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
 * @param {object} pkt
 * @returns {{ tool: string, action: string, payload: Record<string, unknown> } | null}
 */
export function buildInvokeSpecForPacket(pkt) {
  if (!pkt || typeof pkt !== 'object') return null;
  const ps = pkt.packet_status;
  if (ps === 'draft') return null;
  const tool = pkt.preferred_tool;
  const action = String(pkt.preferred_action || '').trim();
  if (!tool || !action || !isValidToolAction(tool, action)) return null;
  const payload = buildInvokePayloadForPacket(pkt);
  return { tool, action, payload };
}

/**
 * tool invoke outcome → packet graph state
 * @param {Record<string, unknown>} outcome
 * @returns {PacketState}
 */
export function derivePacketStateFromOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') return 'failed';
  const oc = String(outcome.outcome_code || '');
  const st = String(outcome.status || '');
  if (st === 'blocked' || oc === TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT) return 'blocked';
  if (
    st === 'failed' ||
    oc === TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT ||
    oc === TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD
  ) {
    return 'failed';
  }
  if (st === 'degraded') return 'review_required';
  if (oc === TOOL_OUTCOME_CODES.CLOUD_AGENT_DISPATCH_ACCEPTED) return 'running';
  if (
    st === 'completed' ||
    oc === TOOL_OUTCOME_CODES.LIVE_COMPLETED ||
    oc === TOOL_OUTCOME_CODES.ARTIFACT_PREPARED
  ) {
    return 'completed';
  }
  return 'running';
}

export const __starterKickoffTestHooks = {
  /** @type {typeof invokeExternalTool | null} */
  invokeFn: null,
};

/**
 * @param {object} packet
 * @param {{ threadKey: string, cosRunId?: string }} ctx
 */
export async function executePacketInvocation(packet, ctx) {
  const threadKey = String(ctx.threadKey || '');
  const cosRunId = ctx.cosRunId != null ? String(ctx.cosRunId).trim() : '';
  const spec = buildInvokeSpecForPacket(packet);
  if (!spec) {
    return { ok: false, blocked: true, reason: 'invalid_packet_spec' };
  }
  const pid = String(packet.packet_id || '').trim();
  const inv = __starterKickoffTestHooks.invokeFn || invokeExternalTool;
  return inv(
    { tool: spec.tool, action: spec.action, payload: spec.payload },
    { threadKey, packetId: pid || undefined, ...(cosRunId ? { cosRunId } : {}) },
  );
}

/**
 * @param {Record<string, unknown>} dispatch
 * @param {NodeJS.ProcessEnv} _env
 * @param {string} _threadKey
 * @returns {{ packet: object, tool: string, action: string, payload: Record<string, unknown> } | null}
 */
export function pickFirstStarterPacket(dispatch, _env, _threadKey) {
  const ordered = orderPacketsByHandoff(dispatch);
  for (const pkt of ordered) {
    if (!pkt || typeof pkt !== 'object') continue;
    const spec = buildInvokeSpecForPacket(pkt);
    if (!spec) continue;
    return { packet: pkt, tool: spec.tool, action: spec.action, payload: spec.payload };
  }
  return null;
}

/**
 * @param {{
 *   threadKey: string,
 *   dispatch: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 *   cosRunId?: string,
 * }} ctx
 */
export async function executeStarterKickoffIfEligible(ctx) {
  const threadKey = String(ctx.threadKey || '');
  const dispatch = ctx.dispatch && typeof ctx.dispatch === 'object' ? ctx.dispatch : {};
  const cosRunId = ctx.cosRunId != null ? String(ctx.cosRunId).trim() : '';

  if (!threadKey) return null;
  if (!dispatch.ok || String(dispatch.status || '') !== 'accepted') return null;

  const pick = pickFirstStarterPacket(dispatch, ctx.env || process.env, threadKey);
  if (!pick) {
    return { executed: false, reason: 'no_runnable_packet' };
  }

  const outcome = await executePacketInvocation(pick.packet, {
    threadKey,
    ...(cosRunId ? { cosRunId } : {}),
  });

  return {
    executed: true,
    tool: pick.tool,
    action: pick.action,
    packet_id: pick.packet?.packet_id != null ? String(pick.packet.packet_id) : null,
    outcome,
  };
}
