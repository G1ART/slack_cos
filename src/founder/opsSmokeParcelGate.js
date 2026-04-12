/**
 * Ops smoke “택배사무소” 게이트 — 플랫 이벤트 → 세션 버킷, 시도 무관 집계 레인, 런 하니스 앵커.
 * 기록·위상 집계 본문은 smokeOps.js; 입구·분류·교차 레인 규칙은 여기만 본다.
 */

import { getRunById, patchRunById } from './executionRunStore.js';

/** @typedef {{ event_type: string, payload: Record<string, unknown>, created_at: string }} SmokeRow */

/**
 * aggregateSmokeSessionProgress 에 항상 포함: attempt_seq 와 무관한 교차 레인 증거.
 * 새 교차 레인 이벤트 타입을 추가할 때는 여기 + `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES`(runStoreSupabase) 를 함께 본다.
 */
export const SESSION_WIDE_AGGREGATE_EVENT_TYPES = new Set([
  'cos_cursor_webhook_ingress_safe',
  'cos_github_fallback_evidence',
  'result_recovery_github_secondary',
  'cursor_receive_intake_committed',
]);

/**
 * `recordOpsSmokeAfterExternalMatch` / `recordOpsSmokeFounderMilestone` 등은 `attempt_seq` 없이
 * `ops_smoke_phase`만 남긴다. 다중 시도 lineage 집계 시 이 행들을 빼면 콜백·wake·마일스톤이
 * 위상에서 사라져 `breaks_at`·`final_status`가 DB 진실과 어긋난다 (live_32 유형).
 */
export const SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE = new Set([
  'external_callback_matched',
  'authoritative_callback_closure_applied',
  'callback_correlated_but_closure_not_applied',
  'run_packet_progression_patched',
  'supervisor_wake_enqueued',
  'founder_milestone_sent',
]);

/**
 * @param {{ payload?: Record<string, unknown> }} row
 */
export function getRowAttemptSeq(row) {
  const pl = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const n = Number(pl.attempt_seq);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 주 시도(primarySeq) 집계 행: 주 시도 ops + 세션 전역 레인만.
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 * @param {number} primarySeq
 */
export function filterRowsForSessionAggregateTopline(rows, primarySeq) {
  const ps = primarySeq > 0 ? primarySeq : 0;
  if (!ps) return rows || [];
  return (rows || []).filter((r) => {
    const et = String(r.event_type || '');
    if (SESSION_WIDE_AGGREGATE_EVENT_TYPES.has(et)) return true;
    if (et === 'ops_smoke_phase') {
      const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
      const ph = String(pl.phase || '').trim();
      if (SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE.has(ph)) return true;
    }
    const seq = getRowAttemptSeq(r);
    if (seq <= 0) return false;
    return seq === ps;
  });
}

/**
 * 동일 run_id 에 여러 smoke_session_id 가 섞인 병렬·재시도 스트림에서, sid 없는 intake 귀속에 쓸
 * 결정적 1순위 세션(행 수 최대, 동률 시 sid 문자열 오름차순 최소).
 *
 * @param {Array<{ run_id?: string, event_type?: string, payload?: Record<string, unknown> }>} flatRows
 * @param {Set<string>} allowedEventTypes
 * @returns {Map<string, string>} run_id → smoke_session_id
 */
export function inferPreferredSmokeSessionIdPerRunFromFlatRows(flatRows, allowedEventTypes) {
  /** @type {Map<string, Map<string, number>>} */
  const counts = new Map();
  for (const row of flatRows || []) {
    if (!allowedEventTypes.has(String(row.event_type || ''))) continue;
    const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sid = String(pl.smoke_session_id || '').trim();
    const rid = String(row.run_id || '').trim();
    if (!sid || !rid || rid === '_orphan') continue;
    if (!counts.has(rid)) counts.set(rid, new Map());
    const m = counts.get(rid);
    m.set(sid, (m.get(sid) || 0) + 1);
  }
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [rid, sidMap] of counts) {
    const entries = [...sidMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length) out.set(rid, entries[0][0]);
  }
  return out;
}

/**
 * @typedef {{
 *   preferredSmokeSessionByRunId?: Map<string, string> | null,
 *   intakeOrphanReplication?: 'all' | 'dominant',
 * }} BuildSmokeSessionBucketsOpts
 */

/**
 * cos_run_events + cos_ops_smoke_events 병합 플랫 행 → smoke_session_id 버킷 (intake 2차 귀속 포함).
 * `intakeOrphanReplication: 'dominant'`(기본): 동일 run 에 세션이 여러 개일 때 intake 를 한 세션에만 붙여 이중 집계를 줄인다.
 * 하니스 `preferredSmokeSessionByRunId` 가 있으면 그 sid 가 추론보다 우선(버킷이 스트림에 있을 때).
 *
 * @param {Array<{ run_id?: string, event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} flatRows
 * @param {Set<string>} allowedEventTypes
 * @param {BuildSmokeSessionBucketsOpts} [opts]
 * @returns {Map<string, { run_ids: string[], rows: SmokeRow[] }>}
 */
export function buildSmokeSessionBucketsFromFlatRows(flatRows, allowedEventTypes, opts = {}) {
  const replication = opts.intakeOrphanReplication === 'all' ? 'all' : 'dominant';
  const harnessMap =
    opts.preferredSmokeSessionByRunId instanceof Map ? opts.preferredSmokeSessionByRunId : null;
  const inferredPref = inferPreferredSmokeSessionIdPerRunFromFlatRows(flatRows, allowedEventTypes);

  /** @param {string} rid */
  const prefForRun = (rid) => {
    const h = harnessMap?.get(rid);
    if (h != null && String(h).trim()) return String(h).trim();
    return inferredPref.get(rid) || '';
  };

  /** @param {string} rid @param {string[]} sids @param {string} pref */
  const pickIntakeTargetSids = (rid, sids, pref) => {
    if (replication === 'all') {
      if (sids.length) return sids;
      if (pref && bySession.has(pref)) return [pref];
      return [];
    }
    const fromHarness = harnessMap != null && harnessMap.has(rid) && String(harnessMap.get(rid) || '').trim() !== '';
    if (fromHarness && pref && bySession.has(pref)) return [pref];
    if (sids.length <= 1) {
      if (sids.length === 1) return sids;
      return pref && bySession.has(pref) ? [pref] : [];
    }
    if (pref && sids.includes(pref)) return [pref];
    return sids;
  };

  /** @type {Map<string, { run_ids: string[], rows: SmokeRow[] }>} */
  const bySession = new Map();
  const pendingIntakeNoSid = [];
  for (const row of flatRows || []) {
    if (!allowedEventTypes.has(String(row.event_type || ''))) continue;
    const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sid = String(pl.smoke_session_id || '').trim();
    const et = String(row.event_type || '');
    if (!sid) {
      if (et === 'cursor_receive_intake_committed') {
        pendingIntakeNoSid.push({ row, pl });
      }
      continue;
    }
    const runId = String(row.run_id || '').trim() || 'unknown';
    if (!bySession.has(sid)) bySession.set(sid, { run_ids: [], rows: [] });
    const bucket = bySession.get(sid);
    bucket.rows.push({
      event_type: et,
      payload: pl,
      created_at: row.created_at != null ? String(row.created_at) : '',
    });
    if (runId && runId !== 'unknown' && !bucket.run_ids.includes(runId)) bucket.run_ids.push(runId);
  }
  /** @type {Map<string, string[]>} */
  const runIdToSmokeSids = new Map();
  for (const [sid, { run_ids }] of bySession) {
    for (const rid of run_ids) {
      if (!rid || rid === '_orphan' || rid === 'unknown') continue;
      const prev = runIdToSmokeSids.get(rid) || [];
      if (!prev.includes(sid)) prev.push(sid);
      runIdToSmokeSids.set(rid, prev);
    }
  }
  for (const { row, pl } of pendingIntakeNoSid) {
    const rid = String(pl.target_run_id || row.run_id || '').trim();
    if (!rid) continue;
    const sids = runIdToSmokeSids.get(rid) || [];
    const pref = prefForRun(rid);
    const targetSids = pickIntakeTargetSids(rid, sids, pref);
    for (const sid of targetSids) {
      const bucket = bySession.get(sid);
      if (!bucket) continue;
      bucket.rows.push({
        event_type: 'cursor_receive_intake_committed',
        payload: pl,
        created_at: row.created_at != null ? String(row.created_at) : '',
      });
    }
  }
  for (const [, bucket] of bySession) {
    bucket.rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return bySession;
}

/**
 * 첫 ops 스모크 기록 시 런 하니스에 고정 앵커 (intake/callback 경로에서 smoke_session_id 조회).
 * @param {string} runId
 * @param {string} smokeSessionId
 */
export async function ensureOpsSmokeSessionIdOnRunHarness(runId, smokeSessionId) {
  const rid = String(runId || '').trim();
  const sid = String(smokeSessionId || '').trim();
  if (!rid || !sid) return;
  const run = await getRunById(rid);
  if (!run) return;
  const prev =
    run.harness_snapshot && typeof run.harness_snapshot === 'object'
      ? { .../** @type {Record<string, unknown>} */ (run.harness_snapshot) }
      : {};
  if (String(prev.ops_smoke_session_id || '').trim() === sid) return;
  prev.ops_smoke_session_id = sid;
  await patchRunById(rid, { harness_snapshot: prev });
}

/**
 * Intake cos_run_events 행에 넣을 smoke_session_id (하니스 앵커만; 없으면 null).
 * @param {Record<string, unknown> | null | undefined} run
 * @returns {string | null}
 */
export function resolveSmokeSessionIdForIntakeFromRun(run) {
  if (!run) return null;
  const hs = run.harness_snapshot && typeof run.harness_snapshot === 'object' ? run.harness_snapshot : {};
  const fromHarness = String(/** @type {Record<string, unknown>} */ (hs).ops_smoke_session_id || '').trim();
  return fromHarness || null;
}
