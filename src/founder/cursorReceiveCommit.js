/**
 * vNext.13.77 — Single intake commit path for signed Cursor callbacks (accepted_external_id authoritative row).
 * Correlation row + dispatch ledger must align. Callback may omit thread_key/packet_id when
 * empty; then values from the accepted_external_id correlation row are used (explicit mismatch still fails).
 */

import { findExternalCorrelation } from './correlationStore.js';
import {
  getRunById,
  patchRunById,
  deriveRunTerminalStatus,
  deriveRunStage,
} from './executionRunStore.js';
import { buildPacketsById, recomputeCurrentNext } from './runProgressor.js';
import { appendCosRunEventForRun } from './runCosEvents.js';
import {
  canonicalizeExternalRunStatus,
  resolveCursorPacketStateAuthority,
  externalBucketToDesiredPacketState,
} from './externalRunStatus.js';

/**
 * @typedef {{
 *   provider: string,
 *   status_hint?: string,
 *   occurred_at?: string,
 *   payload?: Record<string, unknown>,
 * }} CanonicalLike
 */

/**
 * @param {string} runId
 * @param {string} packetId
 * @param {CanonicalLike} canonical
 * @returns {Promise<boolean>}
 */
async function patchRunPacketStateFromCanonical(runId, packetId, canonical) {
  const rid = String(runId || '').trim();
  const pid = String(packetId || '').trim();
  if (!rid || !pid) return false;
  const run = await getRunById(rid);
  if (!run) return false;

  const statusRaw = String(
    canonical.payload && typeof canonical.payload === 'object'
      ? /** @type {Record<string, unknown>} */ (canonical.payload).status || ''
      : '',
  );
  const canon = canonicalizeExternalRunStatus(statusRaw);
  /** @type {string} */
  let desired;
  if (canon.bucket === 'positive_terminal') desired = 'completed';
  else if (canon.bucket === 'negative_terminal') desired = 'failed';
  else if (canon.bucket === 'non_terminal') {
    desired = externalBucketToDesiredPacketState('non_terminal', canon.raw_normalized);
  } else {
    const hint = String(canonical.status_hint || '');
    if (hint === 'external_completed') desired = 'completed';
    else if (hint === 'external_failed') desired = 'failed';
    else desired = 'running';
  }

  const psm = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
  };
  const existing = String(psm[pid] || 'queued');
  const termMap =
    run.cursor_external_terminal_by_packet && typeof run.cursor_external_terminal_by_packet === 'object'
      ? { .../** @type {Record<string, unknown>} */ (run.cursor_external_terminal_by_packet) }
      : {};
  const lastRecRaw = termMap[pid];
  const lastRec =
    lastRecRaw && typeof lastRecRaw === 'object' && !Array.isArray(lastRecRaw)
      ? /** @type {{ occurred_at?: string, outcome?: string }} */ (lastRecRaw)
      : null;

  const res = resolveCursorPacketStateAuthority(existing, desired, canonical.occurred_at, lastRec);
  if (res.skipPatch) return false;

  psm[pid] = res.state;
  if (res.terminalRecord) {
    termMap[pid] = res.terminalRecord;
  }

  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const terminal_packet_ids = required.filter((id) => {
    const s = psm[id];
    return s === 'completed' || s === 'skipped' || s === 'failed';
  });
  const packetsById = buildPacketsById(run);
  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, psm, packetsById);
  const status = deriveRunTerminalStatus(psm, required);
  const stage = deriveRunStage(status, Boolean(run.starter_kickoff && run.starter_kickoff.executed));
  const now = new Date().toISOString();
  await patchRunById(rid, {
    packet_state_map: psm,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : null,
    last_progressed_at: now,
    cursor_external_terminal_by_packet: termMap,
  });
  return true;
}

/**
 * @param {{
 *   accepted_external_id: string,
 *   external_run_id?: string | null,
 *   callback_thread_key: string | null | undefined,
 *   callback_packet_id: string | null | undefined,
 *   canonical: CanonicalLike,
 *   status_bucket: string,
 *   ingress_meta?: Record<string, unknown> | null,
 * }} ctx
 * @returns {Promise<{
 *   committed: boolean,
 *   reason: string,
 *   run_id: string,
 *   packet_id: string,
 *   idempotent?: boolean,
 *   closure_anchor_written?: boolean,
 * }>}
 */
export async function commitReceivedCursorCallbackToRunPacket(ctx) {
  const acc = String(ctx.accepted_external_id || '').trim();
  const extRun = ctx.external_run_id != null ? String(ctx.external_run_id).trim() : '';
  const cbTkIn = ctx.callback_thread_key != null ? String(ctx.callback_thread_key).trim() : '';
  const cbPktIn = ctx.callback_packet_id != null ? String(ctx.callback_packet_id).trim() : '';
  const bucket = String(ctx.status_bucket || '');
  const canonical = ctx.canonical && typeof ctx.canonical === 'object' ? ctx.canonical : {};
  const meta = ctx.ingress_meta && typeof ctx.ingress_meta === 'object' ? ctx.ingress_meta : {};

  if (!acc) {
    return { committed: false, reason: 'accepted_external_id_required', run_id: '', packet_id: '' };
  }

  const corr = await findExternalCorrelation('cursor', 'accepted_external_id', acc);
  if (!corr) {
    return { committed: false, reason: 'accepted_external_id_correlation_not_found', run_id: '', packet_id: '' };
  }

  const runId = String(corr.run_id || '').trim();
  const corrPid = String(corr.packet_id || '').trim();
  const corrTk = String(corr.thread_key || '').trim();
  if (!runId || !corrPid || !corrTk) {
    return { committed: false, reason: 'correlation_row_incomplete', run_id: runId, packet_id: corrPid };
  }

  if (cbPktIn && cbPktIn !== corrPid) {
    return { committed: false, reason: 'callback_packet_id_mismatch_correlation', run_id: runId, packet_id: corrPid };
  }
  if (cbTkIn && cbTkIn !== corrTk) {
    return { committed: false, reason: 'callback_thread_key_mismatch', run_id: runId, packet_id: corrPid };
  }

  const cbPkt = cbPktIn || corrPid;
  const cbTk = cbTkIn || corrTk;

  if (extRun) {
    const cloudHit = await findExternalCorrelation('cursor', 'cloud_agent_run', extRun);
    if (cloudHit) {
      const cr = String(cloudHit.run_id || '').trim();
      const cp = String(cloudHit.packet_id || '').trim();
      if (cr !== runId || cp !== corrPid) {
        return { committed: false, reason: 'external_run_id_correlation_mismatch', run_id: runId, packet_id: corrPid };
      }
    }
  }

  const run = await getRunById(runId);
  if (!run) {
    return { committed: false, reason: 'run_not_found', run_id: runId, packet_id: corrPid };
  }
  if (String(run.thread_key || '').trim() !== corrTk) {
    return { committed: false, reason: 'run_thread_key_mismatch', run_id: runId, packet_id: corrPid };
  }

  const ledger =
    run.cursor_dispatch_ledger && typeof run.cursor_dispatch_ledger === 'object'
      ? /** @type {Record<string, unknown>} */ (run.cursor_dispatch_ledger)
      : {};
  const ledgerPid = String(ledger.target_packet_id || '').trim();
  if (!ledgerPid) {
    return { committed: false, reason: 'dispatch_ledger_target_missing', run_id: runId, packet_id: corrPid };
  }
  if (ledgerPid !== corrPid) {
    return { committed: false, reason: 'ledger_packet_id_mismatch_correlation', run_id: runId, packet_id: corrPid };
  }
  if (cbPkt !== ledgerPid) {
    return { committed: false, reason: 'callback_packet_id_mismatch_ledger', run_id: runId, packet_id: corrPid };
  }

  const statusRaw = String(
    canonical.payload && typeof canonical.payload === 'object'
      ? /** @type {Record<string, unknown>} */ (canonical.payload).status || ''
      : '',
  );
  const canon = canonicalizeExternalRunStatus(statusRaw);
  const effectiveBucket = String(canon.bucket || bucket || '');

  const prevAnchor =
    run.cursor_callback_anchor && typeof run.cursor_callback_anchor === 'object'
      ? /** @type {Record<string, unknown>} */ (run.cursor_callback_anchor)
      : {};
  const psm0 =
    run.packet_state_map && typeof run.packet_state_map === 'object'
      ? /** @type {Record<string, string>} */ (run.packet_state_map)
      : {};
  const st0 = String(psm0[corrPid] || '');

  const terminalPositive = effectiveBucket === 'positive_terminal';
  const terminalNegative = effectiveBucket === 'negative_terminal';

  if (terminalPositive) {
    if (
      prevAnchor.provider_structural_closure_at &&
      String(prevAnchor.provider_structural_closure_packet_id || '').trim() === corrPid &&
      st0 === 'completed'
    ) {
      return {
        committed: true,
        reason: 'idempotent_already_committed',
        run_id: runId,
        packet_id: corrPid,
        idempotent: true,
        closure_anchor_written: true,
      };
    }

    const progressed = await patchRunPacketStateFromCanonical(runId, corrPid, canonical);
    if (!progressed) {
      return { committed: false, reason: 'packet_state_authority_skip', run_id: runId, packet_id: corrPid };
    }

    const canonTop = /** @type {Record<string, unknown>} */ (canonical);
    const reqIdRaw =
      canonTop.callback_request_id_hint != null ? String(canonTop.callback_request_id_hint).trim() : '';
    const reqId = reqIdRaw ? reqIdRaw.slice(0, 128) : null;
    const pathFp =
      meta.payload_fingerprint_prefix != null ? String(meta.payload_fingerprint_prefix).trim().slice(0, 128) : null;

    const nextAnchor = {
      ...prevAnchor,
      provider_structural_closure_at: new Date().toISOString(),
      provider_structural_closure_source: 'provider_runtime',
      provider_structural_closure_request_id: reqId,
      provider_structural_closure_packet_id: corrPid,
      provider_structural_closure_status_bucket: effectiveBucket,
      ...(pathFp ? { provider_structural_closure_paths_fingerprint: pathFp } : {}),
    };
    await patchRunById(runId, { cursor_callback_anchor: nextAnchor });

    await appendCosRunEventForRun(
      runId,
      'cursor_receive_intake_committed',
      {
        target_run_id: runId,
        target_packet_id: corrPid,
        terminal_bucket: effectiveBucket,
        accepted_external_id_tail: acc.length > 8 ? acc.slice(-8) : acc,
      },
      {
        matched_by: meta.matched_by ?? null,
        canonical_status: effectiveBucket,
        payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
      },
    );

    return {
      committed: true,
      reason: 'committed',
      run_id: runId,
      packet_id: corrPid,
      closure_anchor_written: true,
    };
  }

  if (terminalNegative) {
    const progressed = await patchRunPacketStateFromCanonical(runId, corrPid, canonical);
    if (!progressed) {
      return { committed: false, reason: 'packet_state_authority_skip', run_id: runId, packet_id: corrPid };
    }
    const nextAnchor = {
      ...prevAnchor,
      provider_structural_closure_at: new Date().toISOString(),
      provider_structural_closure_source: 'provider_runtime',
      provider_structural_closure_packet_id: corrPid,
      provider_structural_closure_status_bucket: effectiveBucket,
    };
    await patchRunById(runId, { cursor_callback_anchor: nextAnchor });

    await appendCosRunEventForRun(
      runId,
      'cursor_receive_intake_committed',
      {
        target_run_id: runId,
        target_packet_id: corrPid,
        terminal_bucket: effectiveBucket,
        accepted_external_id_tail: acc.length > 8 ? acc.slice(-8) : acc,
      },
      {
        matched_by: meta.matched_by ?? null,
        canonical_status: effectiveBucket,
        payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
      },
    );

    return {
      committed: true,
      reason: 'committed_failed_terminal',
      run_id: runId,
      packet_id: corrPid,
      closure_anchor_written: true,
    };
  }

  const progressed = await patchRunPacketStateFromCanonical(runId, corrPid, canonical);
  if (!progressed) {
    return { committed: false, reason: 'non_terminal_authority_skip', run_id: runId, packet_id: corrPid };
  }
  return { committed: true, reason: 'committed_non_terminal', run_id: runId, packet_id: corrPid };
}
