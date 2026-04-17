/**
 * W8-B — env/secret propagation engine.
 *
 * executePropagationPlan({plan, now, dry_run, writers}) — 각 step 을 순회하며
 * writers[sink_system].write() 를 호출(없으면 'none' 으로 기록). 기본 dry_run=true.
 *
 * Supabase 가 설정되어 있으면 propagation_runs + propagation_steps 에 기록,
 * 아니면 in-memory 스토어로 fallback (테스트 가능).
 *
 * 값(secret) 은 writers 호출 payload 에도 들어가지 않는다 —
 * writer 는 NAME + sink_ref 만 받아 쓰거나 smoke check 를 수행한다.
 *
 * 실패 시 W5-A classifier 는 호출 밖(레인) 에서 붙이며, 여기서는 단순히
 * failure_resolution_class 를 writer 반환값에서 투영만 한다.
 */

import crypto from 'node:crypto';
import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';
import {
  getCapabilityForSink,
  getQualifiedCapabilityForSink,
  isLiveWriteAllowed,
  isVerificationKindSupported,
} from './liveBindingCapabilityRegistry.js';
import { listOpenHumanGates } from './projectSpaceBindingStore.js';
import {
  buildSecretSourceGraph,
  detectSecretLeakInGraph,
} from './secretSourceGraph.js';

/** @type {Map<string, { run: Record<string, unknown>, steps: Array<Record<string, unknown>> }>} */
const memPropagationRuns = new Map();

function asString(v) {
  return v == null ? '' : String(v);
}

function nowIso(now) {
  return now instanceof Date ? now.toISOString() : new Date().toISOString();
}

function storeMode() {
  return getCosRunStoreMode() === 'supabase' ? 'supabase' : 'memory';
}

function newRunId() {
  return crypto.randomUUID();
}

function makeStepRow(runId, step, writerResult) {
  const vResult =
    writerResult && typeof writerResult === 'object' && writerResult.verification_result
      ? String(writerResult.verification_result)
      : 'pending';
  const vKind = writerResult?.verification_kind || step.verification_kind || 'none';
  return {
    id: crypto.randomUUID(),
    propagation_run_id: runId,
    step_index: step.step_index,
    binding_requirement_kind: step.binding_requirement_kind,
    source_system: step.source_system,
    sink_system: step.sink_system,
    secret_handling_mode: step.secret_handling_mode,
    binding_name: step.binding_name || null,
    sink_ref: writerResult?.sink_ref || null,
    wrote_at: writerResult?.wrote_at || null,
    verification_kind: vKind,
    verification_result: vResult,
    failure_resolution_class: writerResult?.failure_resolution_class || null,
  };
}

/**
 * @typedef {Object} WriterInput
 * @property {string} project_space_key
 * @property {string} binding_requirement_kind
 * @property {string} source_system
 * @property {string} sink_system
 * @property {string} secret_handling_mode
 * @property {string|null} binding_name
 * @property {boolean} dry_run
 *
 * @typedef {Object} WriterResult
 * @property {string|null} wrote_at    // ISO when live write happened; null when smoke/dry
 * @property {string|null} sink_ref    // e.g. 'owner/repo', 'project_id', 'service_id'
 * @property {string} secret_handling_mode
 * @property {'read_back'|'smoke'|'none'} verification_kind
 * @property {'ok'|'failed'|'not_applicable'|'pending'} verification_result
 * @property {boolean} live            // true only when actually called external API
 * @property {string|null} [failure_resolution_class]
 *
 * @typedef {Object} PropagationEngineResult
 * @property {string} propagation_run_id
 * @property {string} plan_hash
 * @property {string} status
 * @property {Array<Record<string, unknown>>} step_rows
 * @property {string|null} failure_resolution_class
 */

/**
 * @param {{
 *   plan: import('./envSecretPropagationPlan.js').PropagationPlan,
 *   dry_run?: boolean,
 *   now?: Date,
 *   writers?: Record<string, { write: (req: WriterInput) => Promise<WriterResult> }>,
 *   tenancy?: {
 *     workspace_key?: string | null,
 *     product_key?: string | null,
 *     parcel_deployment_key?: string | null,
 *   },
 * }} input
 * @returns {Promise<PropagationEngineResult>}
 */
export async function executePropagationPlan(input) {
  const plan = input && input.plan;
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
    throw new Error('executePropagationPlan: plan required');
  }
  const dry_run = input.dry_run !== false; // default true
  const writers = input.writers && typeof input.writers === 'object' ? input.writers : {};
  const tenancy = input.tenancy || {};

  const runId = newRunId();
  const startedAt = nowIso(input.now);

  // W12-B: plan 에 이미 포함된 메타 그래프가 있으면 재사용, 없으면 requirements 없이 빈 그래프로 fallback.
  // plan 생성 측에서 buildSecretSourceGraph 를 이미 호출했다면 동일 결과 (순수 함수).
  let secret_source_graph_snapshot = plan.secret_source_graph || null;
  if (!secret_source_graph_snapshot) {
    try {
      secret_source_graph_snapshot = buildSecretSourceGraph({
        project_space_key: plan.project_space_key,
        requirements: [],
        existingBindings: [],
      });
    } catch (_e) {
      secret_source_graph_snapshot = null;
    }
  }
  // redaction guard — raw secret/token/URL 패턴이 snapshot 에 들어가 있지 않은지 검사.
  if (secret_source_graph_snapshot) {
    const leak = detectSecretLeakInGraph(secret_source_graph_snapshot);
    if (leak) {
      console.error('[propagation_engine.snapshot_redaction]', leak);
      secret_source_graph_snapshot = null;
    }
  }

  const run = {
    id: runId,
    project_space_key: plan.project_space_key,
    plan_hash: plan.plan_hash,
    started_at: startedAt,
    finished_at: null,
    status: 'running',
    failure_resolution_class: null,
    workspace_key: asString(tenancy.workspace_key) || null,
    product_key: asString(tenancy.product_key) || null,
    parcel_deployment_key: asString(tenancy.parcel_deployment_key) || null,
    secret_source_graph_snapshot_json: secret_source_graph_snapshot
      ? JSON.parse(JSON.stringify(secret_source_graph_snapshot))
      : null,
  };

  const mode = storeMode();
  const sb = mode === 'supabase' ? createCosRuntimeSupabase() : null;

  if (sb) {
    const { error } = await sb.from('propagation_runs').insert(run);
    if (error) {
      console.error('[propagation_runs.insert]', error.message);
    }
  } else {
    memPropagationRuns.set(runId, { run: { ...run }, steps: [] });
  }

  const stepRows = [];
  let firstFailure = null;
  let anyFailed = false;
  for (const step of plan.steps) {
    let writerResult = null;
    const writer = writers[step.sink_system];
    try {
      if (writer && typeof writer.write === 'function') {
        writerResult = await writer.write({
          project_space_key: plan.project_space_key,
          binding_requirement_kind: step.binding_requirement_kind,
          source_system: step.source_system,
          sink_system: step.sink_system,
          secret_handling_mode: step.secret_handling_mode,
          binding_name: step.binding_name || null,
          dry_run,
        });
      } else {
        writerResult = {
          wrote_at: null,
          sink_ref: null,
          secret_handling_mode: step.secret_handling_mode,
          verification_kind: 'none',
          verification_result: 'not_applicable',
          live: false,
          failure_resolution_class: null,
        };
      }
    } catch (err) {
      writerResult = {
        wrote_at: null,
        sink_ref: null,
        secret_handling_mode: step.secret_handling_mode,
        verification_kind: step.verification_kind || 'none',
        verification_result: 'failed',
        live: false,
        failure_resolution_class: 'tool_adapter_unavailable',
      };
      console.error('[propagation_engine.writer_throw]', step.sink_system, err && err.message);
    }

    // W11-A: step.verification_kind 가 registry 지원 범위 밖이면 none + tool_adapter_unavailable 로 강등
    if (
      writerResult &&
      writerResult.verification_kind &&
      writerResult.verification_kind !== 'none' &&
      !isVerificationKindSupported(step.sink_system, writerResult.verification_kind)
    ) {
      writerResult = {
        ...writerResult,
        verification_kind: 'none',
        verification_result: 'failed',
        failure_resolution_class:
          writerResult.failure_resolution_class || 'tool_adapter_unavailable',
      };
    }

    // W12-A: qualification ledger 기준 live write 불허이면 실제 write 수행 불가 — not_applicable + technical_capability_missing
    if (writerResult && writerResult.live === true) {
      const qualified = getQualifiedCapabilityForSink(step.sink_system);
      if (!isLiveWriteAllowed(qualified)) {
        writerResult = {
          ...writerResult,
          live: false,
          wrote_at: null,
          verification_kind: 'none',
          verification_result: 'not_applicable',
          failure_resolution_class: 'technical_capability_missing',
        };
      }
    }

    const row = makeStepRow(runId, step, writerResult);
    stepRows.push(row);
    if (row.verification_result === 'failed') {
      anyFailed = true;
      if (!firstFailure) firstFailure = row.failure_resolution_class || null;
    }

    if (sb) {
      const { error } = await sb.from('propagation_steps').insert(row);
      if (error) console.error('[propagation_steps.insert]', error.message);
    } else {
      const mem = memPropagationRuns.get(runId);
      if (mem) mem.steps.push({ ...row });
    }
  }

  const finishedAt = nowIso();
  let finalStatus = 'succeeded';
  if (anyFailed) finalStatus = 'failed';
  else if (dry_run) finalStatus = 'verify_pending';

  const updates = {
    finished_at: finishedAt,
    status: finalStatus,
    failure_resolution_class: firstFailure,
  };
  if (sb) {
    const { error } = await sb.from('propagation_runs').update(updates).eq('id', runId);
    if (error) console.error('[propagation_runs.update]', error.message);
  } else {
    const mem = memPropagationRuns.get(runId);
    if (mem) Object.assign(mem.run, updates);
  }

  // W11-D — additive audit rollup (기존 필드는 그대로 유지; 새 필드만 얹는다).
  const attempted_steps_count = stepRows.length;
  const completed_steps_count = stepRows.filter((r) => r.verification_result === 'ok').length;
  const blocked_steps_count = stepRows.filter(
    (r) => r.verification_result === 'failed' || r.verification_result === 'not_applicable',
  ).length;
  const verification_modes_used = [
    ...new Set(
      stepRows
        .map((r) => r.verification_kind)
        .filter((k) => typeof k === 'string' && k.length > 0),
    ),
  ].sort();

  // first blocked step → next_human_action 유도
  const blockedRow = stepRows.find(
    (r) => r.verification_result === 'failed' || r.verification_result === 'not_applicable',
  );
  const blockedStepPlan = blockedRow
    ? plan.steps.find((s) => s.step_index === blockedRow.step_index)
    : null;
  let next_human_action = null;
  if (blockedStepPlan) {
    if (blockedStepPlan.required_human_action) {
      next_human_action = blockedStepPlan.required_human_action;
    } else {
      // registry 에서 유도: requires_manual_confirmation=true 면 "sink 콘솔에서 수동 확인"
      const cap = getCapabilityForSink(blockedStepPlan.sink_system);
      if (cap.requires_manual_confirmation) {
        next_human_action = `${blockedStepPlan.sink_system} 콘솔에서 수동 확인 필요`;
      }
    }
  }

  // resumable: blocked step + 대응 open gate 존재 시 true
  let resumable = false;
  if (blockedRow) {
    try {
      const openGates = await listOpenHumanGates(plan.project_space_key);
      if (Array.isArray(openGates) && openGates.length > 0) {
        resumable = openGates.some((g) => String(g.gate_status || '') === 'open');
      }
    } catch (err) {
      console.error('[propagation_engine.resumable_lookup]', err && err.message);
    }
  }

  return {
    propagation_run_id: runId,
    plan_hash: plan.plan_hash,
    status: finalStatus,
    step_rows: stepRows,
    failure_resolution_class: firstFailure,
    attempted_steps_count,
    completed_steps_count,
    blocked_steps_count,
    verification_modes_used,
    resumable,
    next_human_action,
    secret_source_graph_snapshot: secret_source_graph_snapshot || null,
  };
}

/**
 * W12-B — 특정 propagation_run 의 snapshot (memory 모드용 reader).
 * @param {string} runId
 * @returns {object|null}
 */
export function getPropagationRunSnapshotFromMemory(runId) {
  const key = asString(runId);
  const entry = memPropagationRuns.get(key);
  if (!entry) return null;
  return entry.run.secret_source_graph_snapshot_json || null;
}

/**
 * 최근 project_space 의 propagation_run/steps 반환 (recent-first). 메모리 스토어일 때만 완전 지원.
 * @param {string} project_space_key
 * @param {{ limit?: number }} [opts]
 */
export async function listRecentPropagationRunsForSpace(project_space_key, opts = {}) {
  const key = asString(project_space_key).trim();
  if (!key) return [];
  const limit = Math.max(1, Math.min(20, Number(opts.limit) || 5));
  const mode = storeMode();
  if (mode === 'memory') {
    const rows = [];
    for (const v of memPropagationRuns.values()) {
      if (v.run.project_space_key !== key) continue;
      rows.push({ run: { ...v.run }, steps: v.steps.map((s) => ({ ...s })) });
    }
    rows.sort((a, b) => String(b.run.started_at).localeCompare(String(a.run.started_at)));
    return rows.slice(0, limit);
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) return [];
  const { data: runs, error: rerr } = await sb
    .from('propagation_runs')
    .select('*')
    .eq('project_space_key', key)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (rerr) {
    console.error('[propagation_runs.listRecent]', rerr.message);
    return [];
  }
  const runArr = Array.isArray(runs) ? runs : [];
  if (runArr.length === 0) return [];
  const ids = runArr.map((r) => r.id);
  const { data: steps, error: serr } = await sb
    .from('propagation_steps')
    .select('*')
    .in('propagation_run_id', ids)
    .order('propagation_run_id', { ascending: true })
    .order('step_index', { ascending: true });
  if (serr) console.error('[propagation_steps.listRecent]', serr.message);
  const stepArr = Array.isArray(steps) ? steps : [];
  return runArr.map((r) => ({
    run: r,
    steps: stepArr.filter((s) => s.propagation_run_id === r.id),
  }));
}

export function __resetPropagationEngineMemoryForTests() {
  memPropagationRuns.clear();
}
