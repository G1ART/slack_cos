/**
 * vNext.13.47b — Thread-scoped structured delegate packets for emit_patch (founder invoke bridge).
 * No founder text parsing; source is accepted harness dispatch only.
 */

import { pickFirstStarterPacket, buildInvokePayloadForPacket } from './starterLadder.js';
import { detectNarrowLivePatchFromPayload } from './livePatchPayload.js';

/** @type {Map<string, { packet: object } | null>} */
const stashByThread = new Map();

/** Thread is in live-only/no-fallback smoke when accepted delegate has emit_patch packet with those flags (structured only). */
/** @type {Map<string, boolean>} */
const liveOnlyNoFallbackByThread = new Map();

export function __resetDelegateEmitPatchStashForTests() {
  stashByThread.clear();
  liveOnlyNoFallbackByThread.clear();
}

/**
 * @param {Record<string, unknown>} dispatch
 */
function dispatchHasLiveOnlyNoFallbackEmitPatch(dispatch) {
  const packets = Array.isArray(dispatch.packets) ? dispatch.packets : [];
  for (const p of packets) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    if (String(p.preferred_action || '').trim() !== 'emit_patch') continue;
    const lp = p.live_patch;
    if (lp && typeof lp === 'object' && !Array.isArray(lp) && lp.live_only === true && lp.no_fallback === true) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} threadKey
 */
export function isThreadLiveOnlyNoFallbackSmoke(threadKey) {
  const tk = String(threadKey || '').trim();
  return liveOnlyNoFallbackByThread.get(tk) === true;
}

/**
 * @param {Record<string, unknown>} dispatch
 * @returns {object | null}
 */
function extractStashableEmitPatchPacket(dispatch) {
  const d = dispatch && typeof dispatch === 'object' ? dispatch : {};
  const pick = pickFirstStarterPacket(d, process.env, '');
  if (!pick || pick.tool !== 'cursor' || pick.action !== 'emit_patch') return null;
  const pl = buildInvokePayloadForPacket(pick.packet);
  if (!detectNarrowLivePatchFromPayload(pl)) return null;
  return pick.packet;
}

/**
 * Call after delegate_harness_team accepted — stores narrow live_patch packet for thread.
 * @param {string} threadKey
 * @param {Record<string, unknown>} dispatch
 */
export function stashDelegateEmitPatchContext(threadKey, dispatch) {
  const tk = String(threadKey || '').trim();
  if (!tk) return;
  const d = dispatch && typeof dispatch === 'object' ? dispatch : {};
  liveOnlyNoFallbackByThread.set(tk, dispatchHasLiveOnlyNoFallbackEmitPatch(d));
  const pkt = extractStashableEmitPatchPacket(dispatch);
  stashByThread.set(tk, pkt ? { packet: pkt } : null);
}

/**
 * Merge stashed delegate packet into invoke payload when payload lacks cloud contract source.
 * @param {string} threadKey
 * @param {Record<string, unknown>} payload
 */
export function tryMergeStashedDelegateEmitPatchPayload(threadKey, payload) {
  const tk = String(threadKey || '').trim();
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  if (detectNarrowLivePatchFromPayload(pl) || (Array.isArray(pl.ops) && pl.ops.length > 0)) {
    return { payload: pl, mergedFromDelegate: false };
  }
  const row = stashByThread.get(tk);
  if (!row || !row.packet) return { payload: pl, mergedFromDelegate: false };
  const fromPkt = buildInvokePayloadForPacket(row.packet);
  return { payload: { ...fromPkt, ...pl }, mergedFromDelegate: true };
}
