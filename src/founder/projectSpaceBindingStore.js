/**
 * W5-B — Project-space binding graph store.
 * Supabase 가 설정되어 있으면 service_role 테이블을, 아니면 in-memory 맵을 SSOT 로 사용한다.
 *
 * 스키마: supabase/migrations/20260501120000_project_space_binding_graph.sql
 *   - public.project_spaces(project_space_key PK, display_name, workspace_key, product_key, parcel_deployment_key, …)
 *   - public.project_space_bindings(id, project_space_key FK, binding_kind ENUM, binding_ref, evidence_run_id, 테넄시 3축, created_at)
 *   - public.project_space_human_gates(id, project_space_key FK, gate_kind ENUM, gate_status ENUM, gate_reason, gate_action, opened_by_run_id, closed_by_run_id, 테넄시 3축, opened_at, closed_at)
 *
 * founder 본문에는 값(secret) 이 아니라 이름/참조만 넣는다(헌법 §2/§6, W5-W7 Track B).
 */

import crypto from 'node:crypto';
import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';

export const PROJECT_SPACE_BINDING_KINDS = Object.freeze([
  'repo_binding',
  'default_branch',
  'cursor_root',
  'db_binding',
  'deploy_binding',
  'env_requirement',
]);

export const PROJECT_SPACE_GATE_KINDS = Object.freeze([
  'oauth_authorization',
  'billing_or_subscription',
  'policy_or_product_decision',
  'manual_secret_entry',
  'high_risk_approval',
]);

export const PROJECT_SPACE_GATE_STATUSES = Object.freeze(['open', 'resolved', 'abandoned']);

/** @type {Map<string, Record<string, unknown>>} project_space_key → row */
const memSpaces = new Map();
/** @type {Map<string, Record<string, unknown>>} id → row */
const memBindings = new Map();
/** @type {Map<string, Record<string, unknown>>} id → row */
const memGates = new Map();

function storeMode() {
  const m = getCosRunStoreMode();
  if (m === 'supabase') return 'supabase';
  return 'memory';
}

function asTrimmedString(v) {
  return v == null ? '' : String(v).trim();
}

function ensureEnum(value, allowed, label) {
  const v = asTrimmedString(value);
  if (!allowed.includes(v)) {
    throw new Error(`invalid ${label}: ${v || '(empty)'} (expected one of ${allowed.join('|')})`);
  }
  return v;
}

function shallowTenancySlice(input) {
  return {
    workspace_key: asTrimmedString(input.workspace_key) || null,
    product_key: asTrimmedString(input.product_key) || null,
    parcel_deployment_key: asTrimmedString(input.parcel_deployment_key) || null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

/** @param {string} project_space_key */
export async function getProjectSpace(project_space_key) {
  const key = asTrimmedString(project_space_key);
  if (!key) return null;
  const mode = storeMode();
  if (mode === 'memory') return memSpaces.get(key) || null;
  const sb = createCosRuntimeSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('project_spaces')
    .select('*')
    .eq('project_space_key', key)
    .maybeSingle();
  if (error) {
    console.error('[project_spaces.get]', error.message);
    return null;
  }
  return data || null;
}

/**
 * @param {{
 *   project_space_key: string,
 *   display_name?: string | null,
 *   workspace_key?: string | null,
 *   product_key?: string | null,
 *   parcel_deployment_key?: string | null,
 * }} input
 */
export async function upsertProjectSpace(input) {
  const key = asTrimmedString(input.project_space_key);
  if (!key) throw new Error('upsertProjectSpace: project_space_key required');
  const tenancy = shallowTenancySlice(input);
  const display_name = asTrimmedString(input.display_name) || null;
  const iso = nowIso();

  const row = {
    project_space_key: key,
    display_name,
    ...tenancy,
    updated_at: iso,
  };

  const mode = storeMode();
  if (mode === 'memory') {
    const prev = memSpaces.get(key) || {};
    const next = { ...prev, ...row, created_at: prev.created_at || iso };
    memSpaces.set(key, next);
    return next;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) throw new Error('supabase unavailable');
  const { data, error } = await sb
    .from('project_spaces')
    .upsert(row, { onConflict: 'project_space_key' })
    .select()
    .maybeSingle();
  if (error) {
    console.error('[project_spaces.upsert]', error.message);
    throw new Error(`project_spaces.upsert failed: ${error.message}`);
  }
  return data || row;
}

/**
 * @param {{
 *   project_space_key: string,
 *   binding_kind: string,
 *   binding_ref: string,
 *   evidence_run_id?: string | null,
 *   workspace_key?: string | null,
 *   product_key?: string | null,
 *   parcel_deployment_key?: string | null,
 * }} input
 */
export async function recordBinding(input) {
  const project_space_key = asTrimmedString(input.project_space_key);
  if (!project_space_key) throw new Error('recordBinding: project_space_key required');
  const binding_kind = ensureEnum(input.binding_kind, PROJECT_SPACE_BINDING_KINDS, 'binding_kind');
  const binding_ref = asTrimmedString(input.binding_ref);
  if (!binding_ref) throw new Error('recordBinding: binding_ref required');

  const tenancy = shallowTenancySlice(input);
  const id = newId();
  const iso = nowIso();
  const row = {
    id,
    project_space_key,
    binding_kind,
    binding_ref,
    evidence_run_id: asTrimmedString(input.evidence_run_id) || null,
    ...tenancy,
    created_at: iso,
  };

  const mode = storeMode();
  if (mode === 'memory') {
    if (!memSpaces.has(project_space_key)) {
      throw new Error(`recordBinding: project_space ${project_space_key} does not exist (upsertProjectSpace first)`);
    }
    memBindings.set(id, row);
    return row;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) throw new Error('supabase unavailable');
  const { data, error } = await sb.from('project_space_bindings').insert(row).select().maybeSingle();
  if (error) {
    console.error('[project_space_bindings.insert]', error.message);
    throw new Error(`project_space_bindings.insert failed: ${error.message}`);
  }
  return data || row;
}

/**
 * @param {string} project_space_key
 * @param {{ kind?: string | null } | undefined} opts
 */
export async function listBindingsForSpace(project_space_key, opts = {}) {
  const key = asTrimmedString(project_space_key);
  if (!key) return [];
  const kindFilter = opts.kind ? ensureEnum(opts.kind, PROJECT_SPACE_BINDING_KINDS, 'binding_kind') : null;

  const mode = storeMode();
  if (mode === 'memory') {
    const rows = [];
    for (const r of memBindings.values()) {
      if (r.project_space_key !== key) continue;
      if (kindFilter && r.binding_kind !== kindFilter) continue;
      rows.push(r);
    }
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return rows;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) return [];
  let q = sb
    .from('project_space_bindings')
    .select('*')
    .eq('project_space_key', key)
    .order('created_at', { ascending: true });
  if (kindFilter) q = q.eq('binding_kind', kindFilter);
  const { data, error } = await q;
  if (error) {
    console.error('[project_space_bindings.list]', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {{
 *   project_space_key: string,
 *   gate_kind: string,
 *   gate_reason?: string | null,
 *   gate_action?: string | null,
 *   opened_by_run_id?: string | null,
 *   workspace_key?: string | null,
 *   product_key?: string | null,
 *   parcel_deployment_key?: string | null,
 *   continuation_packet_id?: string | null,
 *   continuation_run_id?: string | null,
 *   continuation_thread_key?: string | null,
 *   required_human_action?: string | null,
 *   resume_target_kind?: 'packet' | 'run' | 'thread' | null,
 *   resume_target_ref?: string | null,
 * }} input
 */
export async function openHumanGate(input) {
  const project_space_key = asTrimmedString(input.project_space_key);
  if (!project_space_key) throw new Error('openHumanGate: project_space_key required');
  const gate_kind = ensureEnum(input.gate_kind, PROJECT_SPACE_GATE_KINDS, 'gate_kind');
  const tenancy = shallowTenancySlice(input);
  const id = newId();
  const iso = nowIso();
  // W11-C: resume_target_kind 와 resume_target_ref 는 동시에 존재하거나 동시에 null 이어야 한다.
  const rtk = asTrimmedString(input.resume_target_kind) || null;
  const rtr = asTrimmedString(input.resume_target_ref) || null;
  if ((rtk && !rtr) || (!rtk && rtr)) {
    throw new Error(
      'openHumanGate: resume_target_kind and resume_target_ref must be set together (or both null)',
    );
  }
  if (rtk && !['packet', 'run', 'thread'].includes(rtk)) {
    throw new Error(
      `openHumanGate: resume_target_kind must be one of packet|run|thread (got ${rtk})`,
    );
  }
  const row = {
    id,
    project_space_key,
    gate_kind,
    gate_status: 'open',
    gate_reason: asTrimmedString(input.gate_reason) || null,
    gate_action: asTrimmedString(input.gate_action) || null,
    opened_by_run_id: asTrimmedString(input.opened_by_run_id) || null,
    closed_by_run_id: null,
    continuation_packet_id: asTrimmedString(input.continuation_packet_id) || null,
    continuation_run_id: asTrimmedString(input.continuation_run_id) || null,
    continuation_thread_key: asTrimmedString(input.continuation_thread_key) || null,
    required_human_action: asTrimmedString(input.required_human_action) || null,
    resume_target_kind: rtk,
    resume_target_ref: rtr,
    reopened_count: 0,
    last_resumed_at: null,
    last_resumed_by: null,
    ...tenancy,
    opened_at: iso,
    closed_at: null,
  };

  const mode = storeMode();
  if (mode === 'memory') {
    if (!memSpaces.has(project_space_key)) {
      throw new Error(`openHumanGate: project_space ${project_space_key} does not exist (upsertProjectSpace first)`);
    }
    memGates.set(id, row);
    return row;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) throw new Error('supabase unavailable');
  const { data, error } = await sb.from('project_space_human_gates').insert(row).select().maybeSingle();
  if (error) {
    console.error('[project_space_human_gates.insert]', error.message);
    throw new Error(`project_space_human_gates.insert failed: ${error.message}`);
  }
  return data || row;
}

/**
 * @param {{ id: string, gate_status?: 'resolved'|'abandoned', closed_by_run_id?: string | null, resumed_by?: string | null }} input
 */
export async function closeHumanGate(input) {
  const id = asTrimmedString(input.id);
  if (!id) throw new Error('closeHumanGate: id required');
  const target = input.gate_status || 'resolved';
  if (target !== 'resolved' && target !== 'abandoned') {
    throw new Error(`closeHumanGate: gate_status must be resolved|abandoned (got ${target})`);
  }
  const iso = nowIso();
  const closedBy = asTrimmedString(input.closed_by_run_id) || null;
  const resumedBy = asTrimmedString(input.resumed_by) || closedBy || null;
  const basePatch = {
    gate_status: target,
    closed_by_run_id: closedBy,
    closed_at: iso,
  };
  // W11-C: close→resolved 시 reopened_count 증분 + last_resumed_at/by 기록
  const auditPatch =
    target === 'resolved'
      ? {
          last_resumed_at: iso,
          last_resumed_by: resumedBy,
        }
      : {};

  const mode = storeMode();
  if (mode === 'memory') {
    const prev = memGates.get(id);
    if (!prev) throw new Error(`closeHumanGate: gate ${id} not found`);
    if (prev.gate_status !== 'open') {
      throw new Error(`closeHumanGate: gate ${id} already ${prev.gate_status}`);
    }
    const prevCount = Number.isFinite(prev.reopened_count) ? prev.reopened_count : 0;
    const next = {
      ...prev,
      ...basePatch,
      ...auditPatch,
      reopened_count: target === 'resolved' ? prevCount + 1 : prevCount,
    };
    memGates.set(id, next);
    return next;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) throw new Error('supabase unavailable');
  // Supabase 에서는 increment 를 두 스텝으로: 우선 현재 값 읽고 +1, patch 전체를 update.
  let prevCount = 0;
  if (target === 'resolved') {
    const { data: cur, error: curErr } = await sb
      .from('project_space_human_gates')
      .select('reopened_count')
      .eq('id', id)
      .maybeSingle();
    if (curErr) console.error('[project_space_human_gates.prevCount]', curErr.message);
    prevCount = cur && Number.isFinite(cur.reopened_count) ? cur.reopened_count : 0;
  }
  const patch = {
    ...basePatch,
    ...auditPatch,
    ...(target === 'resolved' ? { reopened_count: prevCount + 1 } : {}),
  };
  const { data, error } = await sb
    .from('project_space_human_gates')
    .update(patch)
    .eq('id', id)
    .eq('gate_status', 'open')
    .select()
    .maybeSingle();
  if (error) {
    console.error('[project_space_human_gates.update]', error.message);
    throw new Error(`project_space_human_gates.update failed: ${error.message}`);
  }
  if (!data) throw new Error(`closeHumanGate: gate ${id} not open or not found`);
  return data;
}

/**
 * W11-C — 보조 감사 훅. gate 의 resume 시점 기록만 갱신(상태 변경 없음).
 * @param {{ id: string, resumed_by?: string | null }} input
 */
export async function markGateResumed(input) {
  const id = asTrimmedString(input.id);
  if (!id) throw new Error('markGateResumed: id required');
  const iso = nowIso();
  const resumedBy = asTrimmedString(input.resumed_by) || null;

  const mode = storeMode();
  if (mode === 'memory') {
    const prev = memGates.get(id);
    if (!prev) throw new Error(`markGateResumed: gate ${id} not found`);
    const prevCount = Number.isFinite(prev.reopened_count) ? prev.reopened_count : 0;
    const next = {
      ...prev,
      last_resumed_at: iso,
      last_resumed_by: resumedBy,
      reopened_count: prevCount + 1,
    };
    memGates.set(id, next);
    return next;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) throw new Error('supabase unavailable');
  const { data: cur, error: curErr } = await sb
    .from('project_space_human_gates')
    .select('reopened_count')
    .eq('id', id)
    .maybeSingle();
  if (curErr) console.error('[project_space_human_gates.prevCount]', curErr.message);
  const prevCount = cur && Number.isFinite(cur.reopened_count) ? cur.reopened_count : 0;
  const { data, error } = await sb
    .from('project_space_human_gates')
    .update({
      last_resumed_at: iso,
      last_resumed_by: resumedBy,
      reopened_count: prevCount + 1,
    })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[project_space_human_gates.markResumed]', error.message);
    throw new Error(`markGateResumed: ${error.message}`);
  }
  return data;
}

/**
 * @param {string} project_space_key
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listOpenHumanGates(project_space_key) {
  const key = asTrimmedString(project_space_key);
  if (!key) return [];
  const mode = storeMode();
  if (mode === 'memory') {
    const rows = [];
    for (const r of memGates.values()) {
      if (r.project_space_key !== key) continue;
      if (r.gate_status !== 'open') continue;
      rows.push(r);
    }
    rows.sort((a, b) => String(a.opened_at).localeCompare(String(b.opened_at)));
    return rows;
  }
  const sb = createCosRuntimeSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('project_space_human_gates')
    .select('*')
    .eq('project_space_key', key)
    .eq('gate_status', 'open')
    .order('opened_at', { ascending: true });
  if (error) {
    console.error('[project_space_human_gates.listOpen]', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/** Test isolation — memory mode only. */
export function __resetProjectSpaceBindingMemoryForTests() {
  memSpaces.clear();
  memBindings.clear();
  memGates.clear();
}
