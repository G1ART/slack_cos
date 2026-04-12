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
    const seq = getRowAttemptSeq(r);
    if (seq <= 0) return false;
    return seq === ps;
  });
}

/**
 * cos_run_events + cos_ops_smoke_events 병합 플랫 행 → smoke_session_id 버킷 (intake 2차 귀속 포함).
 * @param {Array<{ run_id?: string, event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} flatRows
 * @param {Set<string>} allowedEventTypes
 * @returns {Map<string, { run_ids: string[], rows: SmokeRow[] }>}
 */
export function buildSmokeSessionBucketsFromFlatRows(flatRows, allowedEventTypes) {
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
    for (const sid of sids) {
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
