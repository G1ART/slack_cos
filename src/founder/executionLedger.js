/**
 * Thread 단위 execution evidence (review-loop visibility spine). tracked 경로 사용 금지.
 *
 * Artifact types: harness_dispatch | harness_packet | tool_invocation | tool_result | execution_note
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function cosRuntimeBaseDir() {
  const env = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

function ledgerDir() {
  return path.join(cosRuntimeBaseDir(), 'execution');
}

/** @param {string} threadKey */
function safeFileName(threadKey) {
  const b = Buffer.from(String(threadKey), 'utf8').toString('base64url');
  return `${b}.json`;
}

async function readAll(threadKey) {
  const fp = path.join(ledgerDir(), safeFileName(threadKey));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.artifacts) ? j.artifacts : [];
  } catch {
    return [];
  }
}

async function writeAll(threadKey, artifacts) {
  const dir = ledgerDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, safeFileName(threadKey));
  await fs.writeFile(fp, JSON.stringify({ artifacts }, null, 0), 'utf8');
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeArtifactRow(row) {
  const pl = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  const statusFromPayload = pl.status;
  return {
    ...row,
    status: row.status != null ? row.status : statusFromPayload != null ? statusFromPayload : null,
    attempt: typeof row.attempt === 'number' && row.attempt >= 1 ? row.attempt : 1,
    supersedes: row.supersedes != null ? String(row.supersedes) : null,
    needs_review: Boolean(row.needs_review),
    review_focus: Array.isArray(row.review_focus) ? row.review_focus.map(String) : [],
  };
}

/**
 * @param {string} threadKey
 * @param {{
 *   ts?: string,
 *   type:
 *     | 'harness_dispatch'
 *     | 'harness_packet'
 *     | 'tool_invocation'
 *     | 'tool_result'
 *     | 'execution_note',
 *   summary: string,
 *   payload?: Record<string, unknown>,
 *   status?: string | null,
 *   attempt?: number,
 *   supersedes?: string | null,
 *   needs_review?: boolean,
 *   review_focus?: string[],
 * }} artifact
 */
export async function appendExecutionArtifact(threadKey, artifact) {
  const list = await readAll(threadKey);
  const normalized = normalizeArtifactRow({
    ts: String(artifact.ts || new Date().toISOString()),
    type: artifact.type,
    summary: String(artifact.summary || '').slice(0, 2000),
    payload:
      artifact.payload && typeof artifact.payload === 'object' && !Array.isArray(artifact.payload)
        ? artifact.payload
        : {},
    status: artifact.status,
    attempt: artifact.attempt,
    supersedes: artifact.supersedes,
    needs_review: artifact.needs_review,
    review_focus: artifact.review_focus,
  });
  list.push(normalized);
  await writeAll(threadKey, list);
}

/**
 * Cursor cloud `emit_patch`: dispatch 직후 ledger의 `tool_result`는 `running`으로 남고, 웹훅 클로저는 DB·ops_smoke에만 쌓인다.
 * authoritative callback closure 적용 시 **append**로 완료 한 줄을 남겨 COS가 `[최근 실행 아티팩트]`에서 running 다음에 completed 를 보도록 한다 (기존 행은 수정하지 않음).
 * @param {string} threadKey
 */
export async function appendCloudEmitPatchClosureLedgerMirror(threadKey) {
  const tk = String(threadKey || '').trim();
  if (!tk) return;
  const result_summary =
    'completed / live / cursor:emit_patch — provider callback closure applied (supersedes dispatch running snapshot)';
  await appendExecutionArtifact(tk, {
    type: 'tool_result',
    summary: result_summary.slice(0, 500),
    status: 'completed',
    needs_review: false,
    payload: {
      tool: 'cursor',
      action: 'emit_patch',
      execution_mode: 'live',
      execution_lane: 'cloud_agent',
      status: 'completed',
      outcome_code: 'live_completed',
      result_summary,
      live_attempted: true,
      parcel_ledger_closure_mirror: true,
    },
  });
}

/**
 * @param {string} threadKey
 * @param {number} limit
 */
export async function readRecentExecutionArtifacts(threadKey, limit = 5) {
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  if (mapped.length <= limit) return mapped;
  return mapped.slice(-limit);
}

/**
 * ledger에 해당 도구의 live_completed 기록이 있는지 (Supabase contract 등).
 * @param {string} threadKey
 * @param {string} tool
 * @param {number} lookback
 */
export async function hasRecentToolLiveCompleted(threadKey, tool, lookback = 60) {
  const list = await readAll(threadKey);
  let n = lookback;
  for (let i = list.length - 1; i >= 0 && n > 0; i -= 1, n -= 1) {
    const row = normalizeArtifactRow(list[i]);
    if (row.type !== 'tool_result') continue;
    const pl = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
    if (pl.tool === tool && pl.outcome_code === 'live_completed') return true;
  }
  return false;
}

/**
 * read_execution_context용 — tool_result 기준 집계.
 * @param {string} threadKey
 * @param {number} lookback
 */
export async function computeExecutionOutcomeCounts(threadKey, lookback = 200) {
  const list = await readAll(threadKey);
  const slice = list.slice(-lookback);
  let review_required_count = 0;
  let degraded_count = 0;
  let blocked_count = 0;
  let failed_count = 0;
  for (const raw of slice) {
    const row = normalizeArtifactRow(raw);
    if (row.type !== 'tool_result') continue;
    const pl = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
    if (row.needs_review || pl.needs_review) review_required_count += 1;
    const st = String(row.status || pl.status || '');
    if (st === 'degraded') degraded_count += 1;
    else if (st === 'blocked') blocked_count += 1;
    else if (st === 'failed') failed_count += 1;
  }
  return { review_required_count, degraded_count, blocked_count, failed_count };
}

/**
 * @param {string[]} lines
 */
export function filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines(lines) {
  return (lines || []).filter((line) => {
    const s = String(line);
    if (s.includes('create_spec_disallowed_in_live_only_mode')) return false;
    if (s.includes('live_only_no_fallback_create_spec_forbidden')) return false;
    if (s.includes('cursor:create_spec') && /\bblocked\b/i.test(s)) return false;
    return true;
  });
}

/**
 * live_only emit_patch founder-facing execution summary — drop internal ops tokens (no i18n strings).
 * @param {string[]} lines
 */
export function filterLiveOnlyEmitPatchTechnicalLeakFromExecutionSummaryLines(lines) {
  return (lines || []).filter((line) => {
    const s = String(line);
    if (/callback_timeout/i.test(s)) return false;
    if (/emit_patch_callback/i.test(s)) return false;
    if (/create_spec_disallowed/i.test(s)) return false;
    if (/live_only_no_fallback_create_spec_forbidden/i.test(s)) return false;
    if (/github_fallback/i.test(s)) return false;
    if (/cos_github_fallback_evidence/i.test(s)) return false;
    if (/policy_reject/i.test(s)) return false;
    if (/\bdegraded\b/i.test(s) && /cloud_agent/i.test(s)) return false;
    if (/CURSOR_AUTOMATION|CURSOR_WEBHOOK/i.test(s)) return false;
    return true;
  });
}

/**
 * @param {Record<string, unknown>} run — needs thread_key, id, dispatch_id, required_packet_ids
 * @param {number} limit
 * @param {{
 *   suppressStaleLiveOnlyCreateSpecLeak?: boolean,
 *   suppressLiveOnlyEmitPatchFounderTechnicalLeak?: boolean,
 * }} [opts]
 * @returns {Promise<string[]>}
 */
export async function readExecutionSummaryForRun(run, limit = 5, opts = {}) {
  const threadKey = String(run?.thread_key || '');
  if (!threadKey || !run?.id) return [];
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  const tail = mapped.slice(-Math.max(120, limit * 24));
  let pool = tail.filter((row) => executionArtifactMatchesRun(row, run));
  if (opts.suppressLiveOnlyEmitPatchFounderTechnicalLeak === true) {
    pool = pool.filter((row) => {
      const pl = payloadOfRow(row);
      return pl.suppress_from_founder_execution_summary !== true;
    });
  }
  const sorted = [...pool].sort((a, b) => {
    const na = Boolean(a.needs_review);
    const nb = Boolean(b.needs_review);
    if (na !== nb) return na ? -1 : 1;
    const order = { failed: 0, blocked: 1, degraded: 2, completed: 3 };
    const sa = order[String(a.status || '')] ?? 5;
    const sb = order[String(b.status || '')] ?? 5;
    if (sa !== sb) return sa - sb;
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });
  let lines = sorted.slice(0, limit).map(formatExecutionSummaryLine);
  if (opts.suppressStaleLiveOnlyCreateSpecLeak === true) {
    lines = filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines(lines);
  }
  if (opts.suppressLiveOnlyEmitPatchFounderTechnicalLeak === true) {
    lines = filterLiveOnlyEmitPatchTechnicalLeakFromExecutionSummaryLines(lines);
  }
  return lines;
}


/**
 * COS thread-scoped execution summary lines (not run-filtered).
 * @param {string} threadKey
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
export async function readExecutionSummary(threadKey, limit = 5) {
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  const pool = mapped.slice(-Math.max(40, limit * 6));
  const sorted = [...pool].sort((a, b) => {
    const na = Boolean(a.needs_review);
    const nb = Boolean(b.needs_review);
    if (na !== nb) return na ? -1 : 1;
    const order = { failed: 0, blocked: 1, degraded: 2, completed: 3 };
    const sa = order[String(a.status || '')] ?? 5;
    const sb = order[String(b.status || '')] ?? 5;
    if (sa !== sb) return sa - sb;
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });
  return sorted.slice(0, limit).map(formatExecutionSummaryLine);
}

const REVIEW_QUEUE_STATUS_ORDER = { failed: 0, blocked: 1, degraded: 2, completed: 3 };

/** @param {Record<string, unknown>} row */
function payloadOfRow(row) {
  return row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
}

/**
 * Run-scoped milestone / summary views. No executionRunStore import (avoid cycles).
 * Priority: explicit cos_run_id / run_id; legacy tool rows by run_packet_id ∈ required_packet_ids;
 * harness rows by dispatch_id (+ packet id when present).
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} run
 */
export function executionArtifactMatchesRun(row, run) {
  if (!run || run.id == null || !String(run.id).trim()) return false;
  const runId = String(run.id).trim();
  const dispatchId = String(run.dispatch_id || '').trim();
  const req = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const pl = payloadOfRow(row);
  const type = String(row.type || '');

  const explicitCos = pl.cos_run_id != null ? String(pl.cos_run_id).trim() : '';
  const explicitRid = pl.run_id != null ? String(pl.run_id).trim() : '';
  if (explicitCos || explicitRid) {
    const c = explicitCos || explicitRid;
    return c === runId;
  }

  if (type === 'tool_result' || type === 'tool_invocation') {
    const pid = pl.run_packet_id != null ? String(pl.run_packet_id).trim() : '';
    if (pid && req.includes(pid)) return true;
    return false;
  }
  if (type === 'harness_dispatch') {
    const d = pl.dispatch_id != null ? String(pl.dispatch_id).trim() : '';
    return Boolean(dispatchId) && d === dispatchId;
  }
  if (type === 'harness_packet') {
    const d = pl.dispatch_id != null ? String(pl.dispatch_id).trim() : '';
    const pkt = pl.packet_id != null ? String(pl.packet_id).trim() : '';
    if (!dispatchId || d !== dispatchId) return false;
    if (!pkt) return true;
    return req.includes(pkt);
  }
  return false;
}

/**
 * @param {Record<string, unknown>} row
 */
export function normalizeReviewQueueItem(row) {
  const pl = payloadOfRow(row);
  return {
    type: String(row.type || ''),
    tool: pl.tool != null ? String(pl.tool) : null,
    action: pl.action != null ? String(pl.action) : null,
    status: String(row.status || pl.status || ''),
    outcome_code: pl.outcome_code != null ? String(pl.outcome_code) : null,
    needs_review: Boolean(row.needs_review || pl.needs_review),
    result_summary: String(pl.result_summary || row.summary || '').slice(0, 2000),
    next_required_input: pl.next_required_input ?? null,
    fallback_reason: pl.fallback_reason != null ? String(pl.fallback_reason) : null,
    blocked_reason: pl.blocked_reason != null ? String(pl.blocked_reason) : null,
    ts: String(row.ts || ''),
  };
}

/**
 * Review 대상 tool_result만 — needs_review 또는 failed/blocked/degraded.
 * 정렬: needs_review 우선 → 상태 심각도 → 동일 버킷 내 최신 ts 우선.
 * @param {string} threadKey
 * @param {number} limit
 */
/**
 * @param {Record<string, unknown>} run
 * @param {number} limit
 */
export async function readReviewQueueForRun(run, limit = 10) {
  const threadKey = String(run?.thread_key || '');
  if (!threadKey || !run?.id) return [];
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  const candidates = mapped.filter((row) => {
    if (row.type !== 'tool_result') return false;
    if (!executionArtifactMatchesRun(row, run)) return false;
    const pl = payloadOfRow(row);
    if (pl.suppress_from_founder_review_queue === true) return false;
    const st = String(row.status || pl.status || '');
    const nr = row.needs_review || pl.needs_review;
    if (nr) return true;
    return st === 'failed' || st === 'blocked' || st === 'degraded';
  });
  const sorted = [...candidates].sort((a, b) => {
    const pla = payloadOfRow(a);
    const plb = payloadOfRow(b);
    const na = Boolean(a.needs_review || pla.needs_review);
    const nb = Boolean(b.needs_review || plb.needs_review);
    if (na !== nb) return na ? -1 : 1;
    const sa = REVIEW_QUEUE_STATUS_ORDER[String(a.status || pla.status || '')] ?? 5;
    const sb = REVIEW_QUEUE_STATUS_ORDER[String(b.status || plb.status || '')] ?? 5;
    if (sa !== sb) return sa - sb;
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });
  return sorted.slice(0, limit).map((r) => normalizeReviewQueueItem(r));
}

export async function readReviewQueue(threadKey, limit = 10) {
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  const candidates = mapped.filter((row) => {
    if (row.type !== 'tool_result') return false;
    const pl = payloadOfRow(row);
    const st = String(row.status || pl.status || '');
    const nr = row.needs_review || pl.needs_review;
    if (nr) return true;
    return st === 'failed' || st === 'blocked' || st === 'degraded';
  });
  const sorted = [...candidates].sort((a, b) => {
    const pla = payloadOfRow(a);
    const plb = payloadOfRow(b);
    const na = Boolean(a.needs_review || pla.needs_review);
    const nb = Boolean(b.needs_review || plb.needs_review);
    if (na !== nb) return na ? -1 : 1;
    const sa = REVIEW_QUEUE_STATUS_ORDER[String(a.status || pla.status || '')] ?? 5;
    const sb = REVIEW_QUEUE_STATUS_ORDER[String(b.status || plb.status || '')] ?? 5;
    if (sa !== sb) return sa - sb;
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });
  return sorted.slice(0, limit).map((r) => normalizeReviewQueueItem(r));
}

/**
 * @param {Record<string, unknown>} a
 */
export function formatExecutionSummaryLine(a) {
  const pl = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? a.payload : {};
  const type = String(a.type || '');
  const st = a.status != null ? String(a.status) : pl.status != null ? String(pl.status) : '';
  const stPart = st ? `${st}: ` : '';

  if (type === 'harness_dispatch') {
    const shape = pl.team_shape || '?';
    const obj = String(pl.objective || a.summary || '').slice(0, 100);
    return `- harness_dispatch ${stPart}${shape} / objective: ${obj}`;
  }
  if (type === 'harness_packet') {
    const ps = pl.packet_status || 'ready';
    const pt = pl.preferred_tool || '?';
    const pa = pl.preferred_action || '?';
    const persona = pl.persona || '?';
    return `- harness_packet ${ps}: ${persona} -> ${pt}.${pa}`;
  }
  if (type === 'tool_invocation') {
    const mode = pl.execution_mode || 'artifact';
    const tool = pl.tool || '?';
    const action = pl.action || '?';
    const invSt = pl.status || st || '?';
    const oc = pl.outcome_code ? String(pl.outcome_code) : '';
    const rev = a.needs_review || pl.needs_review ? ' [REVIEW]' : '';
    const ocPart = oc ? ` / ${oc}` : '';
    return `- tool_invocation${rev} ${invSt} / ${mode} / ${tool}:${action}${ocPart}`;
  }
  if (type === 'tool_result') {
    const tool = pl.tool || '?';
    const action = pl.action || '?';
    const mode = pl.execution_mode || '?';
    const rs = pl.status || st || '?';
    const oc = pl.outcome_code ? String(pl.outcome_code) : '';
    const rev = a.needs_review || pl.needs_review ? ' [REVIEW]' : '';
    const next = pl.next_required_input ? ` / next:${String(pl.next_required_input).slice(0, 40)}` : '';
    const ap = pl.artifact_path ? ` / path:${String(pl.artifact_path).slice(-48)}` : '';
    const ocPart = oc ? ` / ${oc}` : '';
    return `- tool_result${rev} ${rs} / ${mode} / ${tool}:${action}${ocPart}${next}${ap}`;
  }
  if (type === 'execution_note') {
    return `- execution_note: ${String(a.summary || '').slice(0, 200)}`;
  }
  return `- ${type}: ${String(a.summary || '').slice(0, 120)}`;
}

/** @param {string} threadKey */
export async function clearExecutionArtifacts(threadKey) {
  const fp = path.join(ledgerDir(), safeFileName(threadKey));
  try {
    await fs.unlink(fp);
  } catch {
    /* 없으면 무시 */
  }
}
