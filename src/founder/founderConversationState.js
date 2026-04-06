/**
 * vNext.13.4 — 창업자 스레드별 durable 대화 상태 (transcript와 별도 정본).
 * vNext.13.6 — latest_file_contexts (Slack 파일 인테이크 요약·상태).
 */

import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveRuntimeRoot() {
  const explicitDir = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  if (explicitDir) {
    return path.isAbsolute(explicitDir) ? explicitDir : path.resolve(PROJECT_ROOT, explicitDir);
  }
  return path.join(os.tmpdir(), 'g1cos-runtime');
}

export function resolveFounderConversationStatePath() {
  const explicitFile = String(process.env.FOUNDER_CONVERSATION_STATE_FILE || '').trim();
  if (explicitFile) {
    return path.isAbsolute(explicitFile) ? explicitFile : path.resolve(PROJECT_ROOT, explicitFile);
  }
  return path.join(resolveRuntimeRoot(), 'founder-conversation-state.json');
}

/** @returns {object} */
export function emptyFounderConversationState(threadKey) {
  const tk = String(threadKey || '').trim() || 'unknown';
  return {
    thread_key: tk,
    project_id: null,
    north_star: null,
    current_problem_statement: null,
    current_scope_summary: null,
    locked_scope: null,
    decisions: [],
    open_questions: [],
    constraints: [],
    benchmarks: [],
    pending_confirmations: [],
    approval_state: null,
    execution_readiness: null,
    latest_proposal_artifact_id: null,
    latest_approval_artifact_id: null,
    latest_execution_artifact_id: null,
    last_founder_confirmation_at: null,
    last_founder_confirmation_kind: null,
    approval_lineage_status: null,
    last_cos_summary: null,
    latest_file_contexts: [],
    updated_at: null,
  };
}

/**
 * @param {object} base
 * @param {Record<string, unknown>} delta
 */
function mergeDelta(base, delta) {
  if (!delta || typeof delta !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(delta)) {
    if (v === undefined) continue;
    if (k === 'decisions' && Array.isArray(v)) {
      out.decisions = [...(out.decisions || []), ...v.map((x) => String(x))];
    } else if (k === 'open_questions' && Array.isArray(v)) {
      out.open_questions = [...(out.open_questions || []), ...v.map((x) => String(x))];
    } else if (k === 'constraints' && Array.isArray(v)) {
      out.constraints = [...(out.constraints || []), ...v.map((x) => String(x))];
    } else if (k === 'benchmarks' && Array.isArray(v)) {
      out.benchmarks = [...(out.benchmarks || []), ...v.map((x) => String(x))];
    } else if (k === 'pending_confirmations' && Array.isArray(v)) {
      out.pending_confirmations = [...(out.pending_confirmations || []), ...v.map((x) => String(x))];
    } else if (k === 'latest_file_contexts' && Array.isArray(v)) {
      const cap = Number(process.env.COS_FOUNDER_FILE_CONTEXT_CAP || 10) || 10;
      const cur = Array.isArray(out.latest_file_contexts) ? out.latest_file_contexts : [];
      const appended = [...cur];
      for (const item of v) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          appended.push({ ...item });
        }
      }
      out.latest_file_contexts = appended.slice(-cap);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v) && k === 'state_delta_nested') {
      /* reserved */
    } else if (
      typeof v === 'string' &&
      [
        'north_star',
        'current_problem_statement',
        'current_scope_summary',
        'locked_scope',
        'last_cos_summary',
        'approval_state',
        'execution_readiness',
        'latest_proposal_artifact_id',
        'latest_approval_artifact_id',
        'latest_execution_artifact_id',
        'last_founder_confirmation_at',
        'last_founder_confirmation_kind',
        'approval_lineage_status',
        'project_id',
      ].includes(k)
    ) {
      out[k] = v;
    } else if (typeof v === 'boolean' || typeof v === 'number' || v === null) {
      out[k] = v;
    }
  }
  out.updated_at = new Date().toISOString();
  return out;
}

async function readStore() {
  const p = resolveFounderConversationStatePath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch {
    /* empty */
  }
  return { by_thread: {} };
}

async function writeStore(store) {
  const p = resolveFounderConversationStatePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {string} threadKey
 */
/**
 * @param {object} base durable row (thread_key 포함)
 * @param {Record<string, unknown>} delta planner state_delta
 * @returns {object} 병합 미리보기 (persist 없음)
 */
export function previewMergeFounderConversationState(base, delta) {
  const tk = String(base?.thread_key || 'unknown').trim() || 'unknown';
  const prev = { ...emptyFounderConversationState(tk), ...base };
  return mergeDelta({ ...prev, thread_key: tk }, delta);
}

export async function getFounderConversationState(threadKey) {
  const tk = String(threadKey || '').trim();
  const store = await readStore();
  const by = store.by_thread || {};
  if (!tk) return emptyFounderConversationState('unknown');
  return by[tk] ? { ...emptyFounderConversationState(tk), ...by[tk], thread_key: tk } : emptyFounderConversationState(tk);
}

/**
 * @param {string} threadKey
 * @param {Record<string, unknown>} delta from sidecar.state_delta
 * @param {{ project_id?: string | null, last_cos_summary?: string | null }} hints
 */
export async function mergeFounderConversationState(threadKey, delta, hints = {}) {
  const tk = String(threadKey || '').trim();
  if (!tk) return emptyFounderConversationState('unknown');
  const store = await readStore();
  if (!store.by_thread) store.by_thread = {};
  const prev = store.by_thread[tk] || emptyFounderConversationState(tk);
  let next = mergeDelta({ ...prev, thread_key: tk }, delta);
  if (hints.project_id != null) next.project_id = hints.project_id;
  if (hints.last_cos_summary != null) next.last_cos_summary = hints.last_cos_summary;
  next.updated_at = new Date().toISOString();
  store.by_thread[tk] = next;
  await writeStore(store);
  return next;
}

/**
 * @param {object} state
 */
export function founderStateToSnapshot(state) {
  const s = state || {};
  const lfc = Array.isArray(s.latest_file_contexts) ? s.latest_file_contexts : [];
  return {
    state_snapshot: {
      north_star: s.north_star,
      current_problem_statement: s.current_problem_statement,
      current_scope_summary: s.current_scope_summary,
      locked_scope: s.locked_scope,
      approval_state: s.approval_state,
      execution_readiness: s.execution_readiness,
    },
    recent_decisions: (s.decisions || []).slice(-12),
    pending_confirmations: s.pending_confirmations || [],
    recent_file_contexts: lfc.slice(-5).map((x) => ({
      filename: x?.filename ?? null,
      summary: String(x?.summary || '').slice(0, 500),
      extract_status: x?.extract_status ?? null,
    })),
    scope_lock_status: s.locked_scope ? 'locked' : s.current_scope_summary ? 'draft' : 'open',
    proposal_history_summary: s.latest_proposal_artifact_id ? `last_proposal:${s.latest_proposal_artifact_id}` : null,
    execution_boundary_status: s.execution_readiness || 'unknown',
  };
}
