/**
 * Project Space Registry — run보다 한 단계 위의 project space 정본.
 *
 * 하나의 project space는 여러 run, playbook, thread를 소유할 수 있다.
 * persistence: data/project-spaces.json (JSON array via jsonStore)
 */

import { readJsonArray, writeJsonArray, ensureJsonFile } from '../storage/jsonStore.js';
import { DATA_DIR } from '../storage/paths.js';
import path from 'path';

const PROJECT_SPACES_FILE = path.join(DATA_DIR, 'project-spaces.json');

function resolveProjectSpacesPath() {
  const v = process.env.PROJECT_SPACES_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.resolve(process.cwd(), v);
  return PROJECT_SPACES_FILE;
}

/** @type {Map<string, object>} */
const spacesById = new Map();
/** @type {Map<string, string>} thread_key → project_id */
const threadIndex = new Map();

function makeProjectId() {
  return `PROJ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
}

export function createProjectSpace(opts = {}) {
  const project_id = opts.project_id || makeProjectId();
  const ts = now();
  const space = {
    project_id,
    human_label: opts.human_label || '',
    aliases: opts.aliases || [],
    canonical_summary: opts.canonical_summary || '',
    repo_owner: opts.repo_owner || null,
    repo_name: opts.repo_name || null,
    default_branch: opts.default_branch || 'main',
    github_ready_status: opts.github_ready_status || 'unknown',
    cursor_workspace_root: opts.cursor_workspace_root || null,
    cursor_handoff_root: opts.cursor_handoff_root || null,
    supabase_project_ref: opts.supabase_project_ref || null,
    supabase_url: opts.supabase_url || null,
    supabase_ready_status: opts.supabase_ready_status || 'unknown',
    vercel_project_id: opts.vercel_project_id || null,
    vercel_project_url: opts.vercel_project_url || null,
    vercel_ready_status: opts.vercel_ready_status || 'unknown',
    railway_project_id: opts.railway_project_id || null,
    railway_service_id: opts.railway_service_id || null,
    railway_ready_status: opts.railway_ready_status || 'unknown',
    deploy_env_map: opts.deploy_env_map || {},
    owner_thread_ids: opts.owner_thread_ids || [],
    linked_playbook_ids: opts.linked_playbook_ids || [],
    active_run_ids: opts.active_run_ids || [],
    status: opts.status || 'active',
    created_at: ts,
    updated_at: ts,
  };

  spacesById.set(project_id, space);
  for (const tid of space.owner_thread_ids) {
    threadIndex.set(tid, project_id);
  }
  persistSpace(space);
  return space;
}

export function getProjectSpaceById(projectId) {
  return spacesById.get(projectId) || null;
}

export function listProjectSpaces() {
  return [...spacesById.values()];
}

export function updateProjectSpace(projectId, patch) {
  const space = spacesById.get(projectId);
  if (!space) return null;
  Object.assign(space, patch, { updated_at: now() });
  persistSpace(space);
  return space;
}

export function linkRunToProjectSpace(projectId, runId) {
  const space = spacesById.get(projectId);
  if (!space) return false;
  if (!space.active_run_ids.includes(runId)) {
    space.active_run_ids.push(runId);
    space.updated_at = now();
    persistSpace(space);
  }
  return true;
}

export function linkThreadToProjectSpace(projectId, threadKey) {
  const space = spacesById.get(projectId);
  if (!space) return false;
  if (!space.owner_thread_ids.includes(threadKey)) {
    space.owner_thread_ids.push(threadKey);
    space.updated_at = now();
    persistSpace(space);
  }
  threadIndex.set(threadKey, projectId);
  return true;
}

export function linkPlaybookToProjectSpace(projectId, playbookId) {
  const space = spacesById.get(projectId);
  if (!space) return false;
  if (!space.linked_playbook_ids.includes(playbookId)) {
    space.linked_playbook_ids.push(playbookId);
    space.updated_at = now();
    persistSpace(space);
  }
  return true;
}

export function getProjectSpaceByThread(threadKey) {
  const pid = threadIndex.get(threadKey);
  return pid ? spacesById.get(pid) || null : null;
}

/** Full-text alias/label search across all spaces */
export function searchProjectSpaces(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const results = [];
  for (const space of spacesById.values()) {
    let score = 0;
    if (space.human_label.toLowerCase().includes(q)) score += 10;
    if (space.repo_name && space.repo_name.toLowerCase().includes(q)) score += 8;
    for (const alias of space.aliases) {
      if (alias.toLowerCase() === q) { score += 15; break; }
      if (alias.toLowerCase().includes(q)) { score += 5; break; }
    }
    if (space.canonical_summary.toLowerCase().includes(q)) score += 3;
    if (score > 0) results.push({ space, score });
  }
  return results.sort((a, b) => b.score - a.score).map((r) => r.space);
}

function persistSpace(space) {
  const fp = resolveProjectSpacesPath();
  readJsonArray(fp)
    .then((arr) => {
      const idx = arr.findIndex((s) => s.project_id === space.project_id);
      if (idx >= 0) arr[idx] = space;
      else arr.push(space);
      return writeJsonArray(fp, arr);
    })
    .catch(() => {});
}

export async function loadProjectSpacesFromDisk() {
  const fp = resolveProjectSpacesPath();
  await ensureJsonFile(fp, '[]');
  const arr = await readJsonArray(fp);
  for (const space of arr) {
    spacesById.set(space.project_id, space);
    for (const tid of (space.owner_thread_ids || [])) {
      threadIndex.set(tid, space.project_id);
    }
  }
  return arr.length;
}

export function _resetForTest() {
  spacesById.clear();
  threadIndex.clear();
}
