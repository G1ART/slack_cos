/**
 * W2-B — minimal harness workcell runtime (descriptive, not a workflow engine).
 */

import { getPersonaContractRowByDelegateEnum } from './personaContractManifest.js';
import { buildFailureClassification } from './failureTaxonomy.js';

const DELEGATE_PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/**
 * W6-B — fixed enum for rework cause codes. packet 입력에 반영되어 있으면 roll-up 하고,
 * 유효하지 않거나 누락이면 null 로 남긴다(가짜 사유 금지).
 */
export const REWORK_CAUSE_CODES = Object.freeze([
  'reviewer_finding',
  'disagreement_unresolved',
  'external_regression',
  'unclear_spec',
  'other',
]);
const REWORK_SET = new Set(REWORK_CAUSE_CODES);

/**
 * W6-B — fixed enum for acceptance evidence. 없는 경우 null.
 */
export const ACCEPTANCE_EVIDENCE_KINDS = Object.freeze([
  'artifact_diff',
  'test_pass',
  'reviewer_sign_off',
  'live_demo',
  'bundle_attached',
]);
const ACCEPTANCE_SET = new Set(ACCEPTANCE_EVIDENCE_KINDS);

/** @typedef {'active'|'review_required'|'rework_requested'|'escalated'|'completed'} WorkcellLifecycleStatus */

const LIFECYCLE = new Set(['active', 'review_required', 'rework_requested', 'escalated', 'completed']);

/**
 * @param {Record<string, unknown>} packet
 * @param {string[]} dispatchPersonas
 * @returns {string | null}
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
 */
function selectPacketReviewerPersona(packet, ownerPersona, dispatchPersonas) {
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
 * @param {Record<string, unknown>[]} packetsWithOwners
 * @param {string[]} dispatchPersonas
 */
function buildReviewCheckpointEntries(packetsWithOwners, dispatchPersonas) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const pkt of packetsWithOwners) {
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
 * @param {Record<string, unknown>} pkt normalized harness packet + owner_persona
 * @param {string[]} personas
 * @returns {{ row: Record<string, unknown> | null, review_required: boolean }}
 */
function effectiveReviewRequired(pkt, personas) {
  const persona = String(pkt.persona || '').toLowerCase().trim();
  const row = persona ? getPersonaContractRowByDelegateEnum(persona) : null;
  const duty = row && typeof row.review_duty === 'string' ? String(row.review_duty).trim() : '';
  const blocking = duty === 'blocking';
  const rr = pkt.review_required === true || blocking;
  return { row, review_required: rr };
}

/**
 * @param {Record<string, unknown>} pkt
 * @param {boolean} review_required
 * @returns {WorkcellLifecycleStatus}
 */
function derivePacketStatus(pkt, review_required) {
  const escRaw = pkt.escalation_target != null ? String(pkt.escalation_target).trim().toLowerCase() : '';
  if (escRaw && DELEGATE_PERSONA_ENUM.has(escRaw)) return 'escalated';
  if (pkt.rework_requested === true) return 'rework_requested';
  if (review_required) return 'review_required';
  if (pkt.workcell_completed === true) return 'completed';
  return 'active';
}

/**
 * @param {WorkcellLifecycleStatus[]} statuses
 * @returns {WorkcellLifecycleStatus}
 */
function deriveWorkcellAggregateStatus(statuses) {
  if (statuses.some((s) => s === 'escalated')) return 'escalated';
  if (statuses.some((s) => s === 'rework_requested')) return 'rework_requested';
  if (statuses.some((s) => s === 'review_required')) return 'review_required';
  if (statuses.length && statuses.every((s) => s === 'completed')) return 'completed';
  return 'active';
}

/**
 * @param {Record<string, unknown>} runtime
 * @param {number} [maxLines]
 * @returns {string[]}
 */
export function formatHarnessWorkcellSummaryLines(runtime, maxLines = 8) {
  const wc = runtime && typeof runtime === 'object' ? runtime : {};
  const st = String(wc.status || 'active');
  const personas = Array.isArray(wc.personas) ? wc.personas.map(String).join(',') : '';
  const pc = typeof wc.packet_count === 'number' ? wc.packet_count : Number(wc.packet_count || 0);
  const lines = [];
  lines.push(`workcell: ${st} | personas=${personas} | packets=${pc}`.slice(0, 400));
  const packets = Array.isArray(wc.packets) ? wc.packets : [];
  const cps = packets
    .filter((p) => p && typeof p === 'object' && p.review_required === true)
    .map((p) => `${String(p.persona || '')}:${String(p.packet_id || '')}`)
    .filter(Boolean);
  lines.push(`review checkpoints: ${cps.length ? cps.join(', ') : 'none'}`.slice(0, 400));
  const open = wc.escalation_open === true;
  lines.push(`escalation open: ${open ? 'yes' : 'no'}`.slice(0, 400));
  const targets = Array.isArray(wc.escalation_targets) ? wc.escalation_targets.map(String).filter(Boolean) : [];
  if (targets.length) lines.push(`escalation targets: ${targets.join(',')}`.slice(0, 400));
  for (const p of packets) {
    if (!p || typeof p !== 'object') continue;
    const persona = String(p.persona || '').trim();
    const pid = String(p.packet_id || '').trim();
    const pst = String(p.status || 'active');
    const tool = p.preferred_tool != null ? String(p.preferred_tool).trim() : 'na';
    const act = p.preferred_action != null ? String(p.preferred_action).trim() : 'na';
    lines.push(`packet ${persona}:${pid} | ${pst} | tool=${tool} | action=${act}`.slice(0, 400));
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  return lines.slice(0, maxLines);
}

/**
 * @param {Record<string, unknown>} runtime
 * @returns {{ ok: true } | { ok: false, blocked_reason: string, machine_hint: string }}
 */
export function validateHarnessWorkcellRuntime(runtime) {
  const wc = runtime && typeof runtime === 'object' ? runtime : {};
  if (!String(wc.workcell_id || '').trim()) {
    return { ok: false, blocked_reason: 'workcell_runtime_invalid_workcell_id', machine_hint: 'workcell_id missing' };
  }
  if (!String(wc.dispatch_id || '').trim()) {
    return { ok: false, blocked_reason: 'workcell_runtime_invalid_dispatch_id', machine_hint: 'dispatch_id missing' };
  }
  const st = String(wc.status || '');
  if (!LIFECYCLE.has(st)) {
    return { ok: false, blocked_reason: 'workcell_runtime_invalid_status', machine_hint: `status not allowed: ${st}` };
  }
  if (!Array.isArray(wc.personas) || wc.personas.length === 0) {
    return { ok: false, blocked_reason: 'workcell_runtime_invalid_personas', machine_hint: 'personas must be non-empty' };
  }
  for (const p of wc.personas) {
    if (!DELEGATE_PERSONA_ENUM.has(String(p || '').toLowerCase().trim())) {
      return { ok: false, blocked_reason: 'workcell_runtime_invalid_persona', machine_hint: String(p) };
    }
  }
  if (!Array.isArray(wc.packets)) {
    return { ok: false, blocked_reason: 'workcell_runtime_packets_missing', machine_hint: 'packets array required' };
  }
  for (let i = 0; i < wc.packets.length; i += 1) {
    const pkt = wc.packets[i];
    if (!pkt || typeof pkt !== 'object') {
      return { ok: false, blocked_reason: 'workcell_runtime_packet_invalid', machine_hint: `packets[${i}]` };
    }
    if (!String(pkt.packet_id || '').trim()) {
      return { ok: false, blocked_reason: 'workcell_runtime_packet_id_missing', machine_hint: `packets[${i}].packet_id` };
    }
    if (!String(pkt.persona || '').trim()) {
      return { ok: false, blocked_reason: 'workcell_runtime_packet_persona_missing', machine_hint: `packets[${i}].persona` };
    }
    if (!String(pkt.owner_persona || '').trim()) {
      return { ok: false, blocked_reason: 'workcell_runtime_owner_missing', machine_hint: `packets[${i}].owner_persona` };
    }
    const ps = String(pkt.status || '');
    if (!LIFECYCLE.has(ps)) {
      return { ok: false, blocked_reason: 'workcell_runtime_packet_status_invalid', machine_hint: `packets[${i}].status=${ps}` };
    }
    if (typeof pkt.review_required !== 'boolean') {
      return {
        ok: false,
        blocked_reason: 'workcell_runtime_review_required_type',
        machine_hint: `packets[${i}].review_required must be boolean`,
      };
    }
  }
  if (typeof wc.packet_count !== 'number' || wc.packet_count !== wc.packets.length) {
    return {
      ok: false,
      blocked_reason: 'workcell_runtime_packet_count_mismatch',
      machine_hint: 'packet_count must equal packets.length',
    };
  }
  if (typeof wc.review_checkpoint_count !== 'number' || wc.review_checkpoint_count < 0) {
    return { ok: false, blocked_reason: 'workcell_runtime_review_checkpoint_count_invalid', machine_hint: 'review_checkpoint_count' };
  }
  if (typeof wc.escalation_open !== 'boolean') {
    return { ok: false, blocked_reason: 'workcell_runtime_escalation_open_invalid', machine_hint: 'escalation_open must be boolean' };
  }
  if (!Array.isArray(wc.escalation_targets)) {
    return { ok: false, blocked_reason: 'workcell_runtime_escalation_targets_invalid', machine_hint: 'escalation_targets must be array' };
  }
  if (!Array.isArray(wc.summary_lines) || wc.summary_lines.length === 0) {
    return { ok: false, blocked_reason: 'workcell_runtime_summary_empty', machine_hint: 'summary_lines must be non-empty' };
  }
  if (typeof wc.reviewer_findings_count !== 'number' || wc.reviewer_findings_count < 0) {
    return { ok: false, blocked_reason: 'workcell_runtime_reviewer_findings_count_invalid', machine_hint: 'reviewer_findings_count' };
  }
  if (typeof wc.unresolved_disagreements !== 'number' || wc.unresolved_disagreements < 0) {
    return { ok: false, blocked_reason: 'workcell_runtime_unresolved_disagreements_invalid', machine_hint: 'unresolved_disagreements' };
  }
  if (wc.rework_cause_code !== null && !REWORK_SET.has(String(wc.rework_cause_code))) {
    return { ok: false, blocked_reason: 'workcell_runtime_rework_cause_code_invalid', machine_hint: String(wc.rework_cause_code) };
  }
  if (wc.acceptance_evidence_kind !== null && !ACCEPTANCE_SET.has(String(wc.acceptance_evidence_kind))) {
    return { ok: false, blocked_reason: 'workcell_runtime_acceptance_evidence_kind_invalid', machine_hint: String(wc.acceptance_evidence_kind) };
  }
  if (wc.correction_hit_rate !== null && !(typeof wc.correction_hit_rate === 'number' && wc.correction_hit_rate >= 0 && wc.correction_hit_rate <= 1)) {
    return { ok: false, blocked_reason: 'workcell_runtime_correction_hit_rate_invalid', machine_hint: 'correction_hit_rate must be number in [0,1]' };
  }
  if (wc.patch_quality_delta !== null && typeof wc.patch_quality_delta !== 'number') {
    return { ok: false, blocked_reason: 'workcell_runtime_patch_quality_delta_invalid', machine_hint: 'patch_quality_delta must be number or null' };
  }
  return { ok: true };
}

/**
 * @param {{
 *   dispatch_id: string,
 *   intent?: string,
 *   objective?: string,
 *   personas: string[],
 *   packets: Record<string, unknown>[],
 *   persona_contract_runtime_snapshot: string[],
 *   thread_key?: string,
 *   run_tenancy?: Record<string, unknown> | null,
 * }} input
 */
export function buildHarnessWorkcellRuntime(input) {
  const a = input && typeof input === 'object' ? input : {};
  const dispatch_id = String(a.dispatch_id || '').trim();
  const personas = (Array.isArray(a.personas) ? a.personas : [])
    .map((x) => String(x || '').toLowerCase().trim())
    .filter((x) => DELEGATE_PERSONA_ENUM.has(x));
  const packetsIn = Array.isArray(a.packets) ? a.packets : [];
  const snap = Array.isArray(a.persona_contract_runtime_snapshot)
    ? a.persona_contract_runtime_snapshot.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
    : [];

  if (!dispatch_id) {
    return blockedConstruction('workcell_dispatch_id_missing', 'dispatch_id required', ['dispatch_id']);
  }
  if (!personas.length) {
    return blockedConstruction('workcell_personas_empty', 'personas required', ['personas']);
  }
  if (!packetsIn.length) {
    return blockedConstruction('workcell_packets_empty', 'packets required', ['packets']);
  }

  for (const pkt of packetsIn) {
    if (!pkt || typeof pkt !== 'object') continue;
    if (pkt.owner_persona != null && String(pkt.owner_persona).trim()) {
      const o = String(pkt.owner_persona).trim().toLowerCase();
      if (!DELEGATE_PERSONA_ENUM.has(o)) {
        return blockedConstruction('workcell_owner_persona_invalid', o, ['owner_persona']);
      }
    }
    if (pkt.reviewer_persona != null && String(pkt.reviewer_persona).trim()) {
      const r = String(pkt.reviewer_persona).trim().toLowerCase();
      if (!DELEGATE_PERSONA_ENUM.has(r)) {
        return blockedConstruction('workcell_reviewer_persona_invalid', r, ['reviewer_persona']);
      }
    }
    if (pkt.escalation_target != null && String(pkt.escalation_target).trim()) {
      const e = String(pkt.escalation_target).trim().toLowerCase();
      if (!DELEGATE_PERSONA_ENUM.has(e)) {
        return blockedConstruction('workcell_escalation_target_invalid', e, ['escalation_target']);
      }
    }
  }

  /** @type {Record<string, unknown>[] } */
  const mergedHarnessPackets = [];
  for (let i = 0; i < packetsIn.length; i += 1) {
    const pkt = packetsIn[i];
    if (!pkt || typeof pkt !== 'object' || Array.isArray(pkt)) {
      return blockedConstruction('workcell_packet_invalid', `packets[${i}]`, [`packets[${i}]`]);
    }
    const owner = normalizePacketOwnerPersona(pkt, personas);
    if (!owner) {
      return blockedConstruction(
        'workcell_packet_owner_unresolved',
        `packets[${i}]`,
        [`packets[${i}].persona`, `packets[${i}].owner_persona`],
      );
    }
    const pid = String(pkt.packet_id || '').trim();
    if (!pid) {
      return blockedConstruction(
        'workcell_packet_id_missing',
        `packets[${i}].packet_id`,
        [`packets[${i}].packet_id`],
      );
    }
    mergedHarnessPackets.push({ ...pkt, owner_persona: owner });
  }

  const internalCheckpoints = buildReviewCheckpointEntries(mergedHarnessPackets, personas);

  /** @type {WorkcellLifecycleStatus[]} */
  const packetStatuses = [];
  /** @type {Record<string, unknown>[] } */
  const runtimePackets = [];
  /** @type {string[]} */
  const escalationTargets = [];

  for (const pkt of mergedHarnessPackets) {
    const persona = String(pkt.persona || '').toLowerCase().trim();
    if (!persona || !DELEGATE_PERSONA_ENUM.has(persona)) {
      return blockedConstruction('workcell_packet_persona_invalid', String(pkt.packet_id || ''), ['persona']);
    }
    const { review_required } = effectiveReviewRequired(pkt, personas);
    const escRaw = pkt.escalation_target != null ? String(pkt.escalation_target).trim().toLowerCase() : '';
    const escalation_target = escRaw && DELEGATE_PERSONA_ENUM.has(escRaw) ? escRaw : null;
    if (escalation_target && !escalationTargets.includes(escalation_target)) escalationTargets.push(escalation_target);

    const pst = derivePacketStatus(pkt, review_required);
    packetStatuses.push(pst);

    runtimePackets.push({
      packet_id: String(pkt.packet_id || '').trim(),
      persona,
      owner_persona: String(pkt.owner_persona || '').toLowerCase().trim(),
      status: pst,
      review_required,
      escalation_target,
      preferred_tool: pkt.preferred_tool != null ? String(pkt.preferred_tool).trim() || null : null,
      preferred_action: pkt.preferred_action != null ? String(pkt.preferred_action).trim() || null : null,
    });
  }

  const status = deriveWorkcellAggregateStatus(packetStatuses);
  const review_checkpoint_count = internalCheckpoints.length;
  const escalation_open = escalationTargets.length > 0 || status === 'escalated';

  const proofFields = deriveHarnessProofFields(mergedHarnessPackets, a);

  const workcell_id = `wc_${dispatch_id}`;

  /** @type {Record<string, unknown>} */
  const workcell_runtime = {
    workcell_id,
    dispatch_id,
    status,
    personas,
    packet_count: runtimePackets.length,
    review_checkpoint_count,
    escalation_open,
    escalation_targets: escalationTargets.slice(0, 12),
    packets: runtimePackets,
    summary_lines: [],
    reviewer_findings_count: proofFields.reviewer_findings_count,
    rework_cause_code: proofFields.rework_cause_code,
    acceptance_evidence_kind: proofFields.acceptance_evidence_kind,
    unresolved_disagreements: proofFields.unresolved_disagreements,
    correction_hit_rate: proofFields.correction_hit_rate,
    patch_quality_delta: proofFields.patch_quality_delta,
  };

  workcell_runtime.summary_lines = formatHarnessWorkcellSummaryLines(workcell_runtime, 8);

  const classification = classifyWorkcellRuntime(workcell_runtime);
  if (classification) workcell_runtime.failure_classification = classification;

  const v = validateHarnessWorkcellRuntime(workcell_runtime);
  if (!v.ok) {
    return {
      ok: false,
      blocked_reason: v.blocked_reason,
      machine_hint: v.machine_hint,
      delegate_schema_error_fields: ['workcell_runtime'],
      failure_classification: buildFailureClassification({
        resolution_class: 'model_coordination_failure',
        human_gate_reason: `harness 워크셀 런타임이 구성 단계에서 ${v.blocked_reason} 로 막혔습니다.`,
        human_gate_action: null,
      }),
    };
  }

  return {
    ok: true,
    workcell_runtime,
    workcell_summary_lines: /** @type {string[]} */ (workcell_runtime.summary_lines),
    packets: mergedHarnessPackets,
    failure_classification: classification,
  };
}

/**
 * W5-A helper — attach a failure_classification to construction-time bail outs so that
 * downstream callers (runFounderDirectConversation → founderSurfaceModel) can surface a
 * consistent resolution_class regardless of which validation failed first.
 *
 * @param {string} blocked_reason
 * @param {string} machine_hint
 * @param {string[]} delegate_schema_error_fields
 */
function blockedConstruction(blocked_reason, machine_hint, delegate_schema_error_fields) {
  return {
    ok: false,
    blocked_reason,
    machine_hint,
    delegate_schema_error_fields,
    failure_classification: buildFailureClassification({
      resolution_class: 'model_coordination_failure',
      human_gate_reason: `harness 워크셀 구성이 ${blocked_reason} 로 막혔습니다.`,
      human_gate_action: null,
    }),
  };
}

/**
 * W5-A classifier for the workcell runtime. Returns null when the workcell is healthy
 * (`active` / `completed`). For escalated / review_required / rework_requested, attaches
 * a `model_coordination_failure` classification because these are harness-internal
 * coordination states (not HIL-required unless W5-B binding graph escalates further).
 *
 * @param {Record<string, unknown>} wc
 * @returns {ReturnType<typeof buildFailureClassification> | null}
 */
export function classifyWorkcellRuntime(wc) {
  if (!wc || typeof wc !== 'object') return null;
  const st = String(wc.status || 'active');
  if (st === 'active' || st === 'completed') return null;
  const targets = Array.isArray(wc.escalation_targets)
    ? wc.escalation_targets.map(String).filter(Boolean)
    : [];
  const reviewCount = typeof wc.review_checkpoint_count === 'number' ? wc.review_checkpoint_count : 0;
  const reason = st === 'escalated'
    ? `워크셀에서 에스컬레이션이 열려 있습니다 (대상: ${targets.join(',') || '미상'}).`
    : st === 'review_required'
      ? `워크셀 리뷰 체크포인트 ${reviewCount}건이 대기 중입니다.`
      : `워크셀에서 재작업 요청이 열려 있습니다.`;
  return buildFailureClassification({
    resolution_class: 'model_coordination_failure',
    human_gate_required: false,
    human_gate_reason: reason,
    human_gate_action: null,
    retryable: false,
  });
}

/** @deprecated use formatHarnessWorkcellSummaryLines */
export function formatWorkcellRuntimeSummaryLines(runtime, maxLines = 8) {
  return formatHarnessWorkcellSummaryLines(runtime, maxLines);
}

/**
 * W6-B — Harness proof instrumentation derivation (Track E).
 * 입력 packet 에 값이 없으면 0/null 로 남긴다(가짜 값 금지).
 *
 * @param {Record<string, unknown>[]} packets  — merged packets after owner resolution
 * @param {Record<string, unknown>} input      — original runtime input (top-level overrides)
 */
function deriveHarnessProofFields(packets, input) {
  let reviewer_findings_count = 0;
  let unresolved_disagreements = 0;
  /** @type {string | null} */
  let rework_cause_code = null;
  /** @type {string | null} */
  let acceptance_evidence_kind = null;

  for (const pkt of packets) {
    if (!pkt || typeof pkt !== 'object') continue;
    const rfc = Number(pkt.reviewer_findings_count);
    if (Number.isFinite(rfc) && rfc > 0) reviewer_findings_count += Math.trunc(rfc);
    if (pkt.disagreement_open === true) unresolved_disagreements += 1;
    const rcc = typeof pkt.rework_cause_code === 'string' ? pkt.rework_cause_code.trim().toLowerCase() : '';
    if (rcc && REWORK_SET.has(rcc)) {
      if (!rework_cause_code) rework_cause_code = rcc;
    }
    const aek = typeof pkt.acceptance_evidence_kind === 'string'
      ? pkt.acceptance_evidence_kind.trim().toLowerCase()
      : '';
    if (aek && ACCEPTANCE_SET.has(aek)) {
      if (!acceptance_evidence_kind) acceptance_evidence_kind = aek;
    }
  }

  // top-level overrides from runtime input (explicit wins over packet-rollup for proof values)
  const topRework = typeof input.rework_cause_code === 'string' ? input.rework_cause_code.trim().toLowerCase() : '';
  if (topRework && REWORK_SET.has(topRework)) rework_cause_code = topRework;
  const topAccept = typeof input.acceptance_evidence_kind === 'string'
    ? input.acceptance_evidence_kind.trim().toLowerCase()
    : '';
  if (topAccept && ACCEPTANCE_SET.has(topAccept)) acceptance_evidence_kind = topAccept;

  const chrRaw = Number(input.correction_hit_rate);
  const correction_hit_rate = Number.isFinite(chrRaw) && chrRaw >= 0 && chrRaw <= 1 ? chrRaw : null;
  const pqdRaw = Number(input.patch_quality_delta);
  const patch_quality_delta = Number.isFinite(pqdRaw) ? pqdRaw : null;

  // If rework_cause_code ends up set but no rework happened anywhere, clear it — honesty rule.
  const anyRework = packets.some((p) => p && typeof p === 'object' && p.rework_requested === true);
  if (!anyRework && !topRework) rework_cause_code = null;

  return {
    reviewer_findings_count,
    rework_cause_code,
    acceptance_evidence_kind,
    unresolved_disagreements,
    correction_hit_rate,
    patch_quality_delta,
  };
}

/**
 * W6-B — compact lines for founder-facing read_execution_context slice.
 * 모델이 소비하는 내부 요약; founder 표면으로 노출할 때는 호출측에서 다시 정제해야 한다.
 *
 * @param {Record<string, unknown>} runtime
 * @param {number} [maxLines]
 */
export function formatHarnessProofSnapshotLines(runtime, maxLines = 6) {
  const wc = runtime && typeof runtime === 'object' ? runtime : {};
  /** @type {string[]} */
  const out = [];
  const rfc = Number(wc.reviewer_findings_count);
  const unres = Number(wc.unresolved_disagreements);
  if (Number.isFinite(rfc)) out.push(`reviewer_findings=${rfc}`);
  if (Number.isFinite(unres)) out.push(`unresolved_disagreements=${unres}`);
  if (wc.rework_cause_code) out.push(`rework_cause=${wc.rework_cause_code}`);
  if (wc.acceptance_evidence_kind) out.push(`acceptance=${wc.acceptance_evidence_kind}`);
  if (wc.correction_hit_rate != null) out.push(`correction_hit_rate=${wc.correction_hit_rate}`);
  if (wc.patch_quality_delta != null) out.push(`patch_quality_delta=${wc.patch_quality_delta}`);
  return out.slice(0, maxLines);
}
