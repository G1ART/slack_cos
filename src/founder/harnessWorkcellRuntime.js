/**
 * W2-B — minimal harness workcell runtime (packet ownership, review checkpoints, escalation shell).
 * Downstream of persona contract validation; does not replace it.
 */

import { getPersonaContractRowByDelegateEnum } from './personaContractManifest.js';

const DELEGATE_PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/**
 * @param {Record<string, unknown>} packet
 * @param {string[]} dispatchPersonas delegate_persona_enum list (ordered)
 * @returns {string | null} normalized owner persona or null if unresolved
 */
export function normalizePacketOwnerPersona(packet, dispatchPersonas) {
  const plist = (Array.isArray(dispatchPersonas) ? dispatchPersonas : [])
    .map((x) => String(x || '').toLowerCase().trim())
    .filter((x) => DELEGATE_PERSONA_ENUM.has(x));
  const rawOwner = packet.owner_persona != null ? String(packet.owner_persona).trim().toLowerCase() : '';
  if (rawOwner) {
    if (!DELEGATE_PERSONA_ENUM.has(rawOwner)) return null;
    return rawOwner;
  }
  const pen = String(packet.persona || '').toLowerCase().trim();
  if (pen && DELEGATE_PERSONA_ENUM.has(pen)) return pen;
  if (plist.length) return plist[0];
  return null;
}

/**
 * @param {Record<string, unknown>} packet
 * @param {string} ownerPersona
 * @param {string[]} dispatchPersonas
 * @returns {{ reviewer_persona: string, self_review_only: boolean }}
 */
export function selectPacketReviewerPersona(packet, ownerPersona, dispatchPersonas) {
  const plist = (Array.isArray(dispatchPersonas) ? dispatchPersonas : [])
    .map((x) => String(x || '').toLowerCase().trim())
    .filter((x) => DELEGATE_PERSONA_ENUM.has(x));
  const rawRev = packet.reviewer_persona != null ? String(packet.reviewer_persona).trim().toLowerCase() : '';
  if (rawRev && DELEGATE_PERSONA_ENUM.has(rawRev)) {
    if (rawRev !== ownerPersona) {
      return { reviewer_persona: rawRev, self_review_only: false };
    }
    const otherFromExplicit = plist.find((p) => p !== ownerPersona);
    if (otherFromExplicit) return { reviewer_persona: otherFromExplicit, self_review_only: false };
    return { reviewer_persona: ownerPersona, self_review_only: true };
  }
  const other = plist.find((p) => p !== ownerPersona);
  if (other) return { reviewer_persona: other, self_review_only: false };
  return { reviewer_persona: ownerPersona, self_review_only: true };
}

/**
 * @param {Record<string, unknown>[]} packets with owner_persona set
 * @param {string[]} dispatchPersonas
 * @returns {Record<string, unknown>[]}
 */
export function buildReviewCheckpointEntries(packets, dispatchPersonas) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const pkt of packets) {
    if (!pkt || typeof pkt !== 'object') continue;
    const persona = String(pkt.persona || '').toLowerCase().trim();
    const row = persona ? getPersonaContractRowByDelegateEnum(persona) : null;
    const duty = row && typeof row.review_duty === 'string' ? String(row.review_duty).trim() : '';
    const needs = pkt.review_required === true || duty === 'blocking';
    if (!needs) continue;
    const owner = String(pkt.owner_persona || '').toLowerCase().trim();
    const packetId = String(pkt.packet_id || '').trim();
    if (!packetId || !owner) continue;
    const { reviewer_persona, self_review_only } = selectPacketReviewerPersona(pkt, owner, dispatchPersonas);
    /** @type {string[]} */
    const reasons = [];
    if (pkt.review_required === true) reasons.push('review_required');
    if (duty === 'blocking') reasons.push('persona_contract_blocking_review_duty');
    const review_reason = reasons.join('+') || 'review_checkpoint';
    out.push({
      packet_id: packetId,
      owner_persona: owner,
      reviewer_persona,
      review_state: 'pending',
      review_reason,
      ...(self_review_only ? { self_review_only: true } : {}),
    });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} workcellRuntime
 * @param {number} [maxLines]
 * @returns {string[]}
 */
export function formatWorkcellRuntimeSummaryLines(workcellRuntime, maxLines = 12) {
  const wc = workcellRuntime && typeof workcellRuntime === 'object' ? workcellRuntime : {};
  /** @type {string[]} */
  const lines = [];
  const wid = String(wc.workcell_id || '').trim();
  const did = String(wc.dispatch_id || '').trim();
  const pc = typeof wc.packet_count === 'number' ? wc.packet_count : Number(wc.packet_count || 0);
  const rc = typeof wc.review_required_count === 'number' ? wc.review_required_count : Number(wc.review_required_count || 0);
  const esc = wc.escalation_state && typeof wc.escalation_state === 'object' ? wc.escalation_state : {};
  const st = String(esc.status || 'none');
  lines.push(`workcell ${wid || did} dispatch=${did} packets=${pc} review_gate=${rc} escalation=${st}`.slice(0, 400));
  const owners = Array.isArray(wc.packet_owners) ? wc.packet_owners : [];
  for (const o of owners) {
    if (!o || typeof o !== 'object') continue;
    const pid = String(o.packet_id || '').trim();
    const op = String(o.owner_persona || '').trim();
    if (!pid) continue;
    lines.push(`owner ${pid}→${op}`.slice(0, 400));
    if (lines.length >= maxLines) return lines;
  }
  const cps = Array.isArray(wc.review_checkpoints) ? wc.review_checkpoints : [];
  for (const c of cps) {
    if (!c || typeof c !== 'object') continue;
    const self = c.self_review_only === true ? ' self_review' : '';
    lines.push(
      `review_cp ${String(c.packet_id || '')} ${String(c.owner_persona || '')}→${String(c.reviewer_persona || '')} ${String(c.review_state || '')}${self}`.slice(
        0,
        400,
      ),
    );
    if (lines.length >= maxLines) return lines;
  }
  return lines.slice(0, maxLines);
}

/**
 * @param {{
 *   dispatch_id: string,
 *   objective: string,
 *   personas: string[],
 *   packets: Record<string, unknown>[],
 *   persona_contract_runtime_snapshot: string[],
 * }} args
 * @returns {{ ok: true, workcell_runtime: Record<string, unknown>, workcell_summary_lines: string[], packets: Record<string, unknown>[] } | { ok: false, blocked_reason: string, machine_hint: string, delegate_schema_error_fields?: string[] }}
 */
export function buildHarnessWorkcellRuntime(args) {
  const a = args && typeof args === 'object' ? args : {};
  const dispatch_id = String(a.dispatch_id || '').trim();
  const objective = String(a.objective || '').trim();
  const personas = (Array.isArray(a.personas) ? a.personas : [])
    .map((x) => String(x || '').toLowerCase().trim())
    .filter((x) => DELEGATE_PERSONA_ENUM.has(x));
  const packetsIn = Array.isArray(a.packets) ? a.packets : [];
  const snap = Array.isArray(a.persona_contract_runtime_snapshot)
    ? a.persona_contract_runtime_snapshot.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
    : [];

  if (!dispatch_id) {
    return {
      ok: false,
      blocked_reason: 'workcell_dispatch_id_missing',
      machine_hint: 'dispatch_id required for workcell runtime',
      delegate_schema_error_fields: ['dispatch_id'],
    };
  }
  if (!personas.length) {
    return {
      ok: false,
      blocked_reason: 'workcell_personas_empty',
      machine_hint: 'at least one delegate persona required for ownership fallback',
      delegate_schema_error_fields: ['personas'],
    };
  }
  if (!packetsIn.length) {
    return {
      ok: false,
      blocked_reason: 'workcell_packets_empty',
      machine_hint: 'accepted harness dispatch requires packets',
      delegate_schema_error_fields: ['packets'],
    };
  }

  for (const pkt of packetsIn) {
    if (!pkt || typeof pkt !== 'object') continue;
    if (pkt.owner_persona != null && String(pkt.owner_persona).trim()) {
      const o = String(pkt.owner_persona).trim().toLowerCase();
      if (!DELEGATE_PERSONA_ENUM.has(o)) {
        return {
          ok: false,
          blocked_reason: 'workcell_owner_persona_invalid',
          machine_hint: `owner_persona not a delegate enum: ${o}`,
          delegate_schema_error_fields: ['packets.owner_persona'],
        };
      }
    }
    if (pkt.reviewer_persona != null && String(pkt.reviewer_persona).trim()) {
      const r = String(pkt.reviewer_persona).trim().toLowerCase();
      if (!DELEGATE_PERSONA_ENUM.has(r)) {
        return {
          ok: false,
          blocked_reason: 'workcell_reviewer_persona_invalid',
          machine_hint: `reviewer_persona not a delegate enum: ${r}`,
          delegate_schema_error_fields: ['packets.reviewer_persona'],
        };
      }
    }
  }

  /** @type {Record<string, unknown>[] } */
  const normalizedPackets = [];
  /** @type {{ packet_id: string, owner_persona: string }[]} */
  const packet_owners = [];

  for (let i = 0; i < packetsIn.length; i += 1) {
    const pkt = packetsIn[i];
    if (!pkt || typeof pkt !== 'object' || Array.isArray(pkt)) {
      return {
        ok: false,
        blocked_reason: 'workcell_packet_invalid',
        machine_hint: `packets[${i}] not an object`,
        delegate_schema_error_fields: [`packets[${i}]`],
      };
    }
    const owner = normalizePacketOwnerPersona(pkt, personas);
    if (!owner) {
      return {
        ok: false,
        blocked_reason: 'workcell_packet_owner_unresolved',
        machine_hint: `packets[${i}] owner could not be resolved`,
        delegate_schema_error_fields: [`packets[${i}].owner_persona`, `packets[${i}].persona`],
      };
    }
    const pid = String(pkt.packet_id || '').trim();
    if (!pid) {
      return {
        ok: false,
        blocked_reason: 'workcell_packet_id_missing',
        machine_hint: `packets[${i}].packet_id required for workcell`,
        delegate_schema_error_fields: [`packets[${i}].packet_id`],
      };
    }
    const next = { ...pkt, owner_persona: owner };
    normalizedPackets.push(next);
    packet_owners.push({ packet_id: pid, owner_persona: owner });
  }

  let review_required_count = 0;
  for (const pkt of normalizedPackets) {
    const persona = String(pkt.persona || '').toLowerCase().trim();
    const row = persona ? getPersonaContractRowByDelegateEnum(persona) : null;
    const duty = row && typeof row.review_duty === 'string' ? String(row.review_duty).trim() : '';
    if (pkt.review_required === true || duty === 'blocking') review_required_count += 1;
  }

  const review_checkpoints = buildReviewCheckpointEntries(normalizedPackets, personas);

  const workcell_id = `wc_${dispatch_id}`;
  const escalation_state = {
    status: 'none',
    reasons: [],
  };

  /** @type {Record<string, unknown>} */
  const workcell_core = {
    workcell_id,
    dispatch_id,
    objective: objective.slice(0, 500),
    personas,
    packet_count: normalizedPackets.length,
    review_required_count,
    packet_owners,
    review_checkpoints,
    escalation_state,
    persona_contract_runtime_snapshot: snap,
  };

  const summary_lines = formatWorkcellRuntimeSummaryLines(workcell_core, 12);
  const workcell_runtime = { ...workcell_core, summary_lines };

  return {
    ok: true,
    workcell_runtime,
    workcell_summary_lines: summary_lines,
    packets: normalizedPackets,
  };
}
