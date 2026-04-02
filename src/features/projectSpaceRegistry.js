/**
 * Project Space Registry — run보다 한 단계 위의 project space 정본.
 *
 * 하나의 project space는 여러 run, playbook, thread를 소유할 수 있다.
 * persistence: data/project-spaces.json (JSON array via jsonStore)
 */

import { readJsonArray, writeJsonArray, ensureJsonFile } from '../storage/jsonStore.js';
import { DATA_DIR } from '../storage/paths.js';
import path from 'path';
import { getExecutionRunById } from './executionRun.js';

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
    last_bootstrap_status: opts.last_bootstrap_status || 'not_bootstrapped',
    last_deploy_status: opts.last_deploy_status || 'none',
    last_deploy_at: opts.last_deploy_at || null,
    last_thread_key: opts.last_thread_key ?? null,
    last_goal_fingerprint: opts.last_goal_fingerprint ?? null,
    last_launch_at: opts.last_launch_at ?? null,
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

/**
 * Score-based search across all spaces. Returns {space, score}[] sorted desc.
 * Callers needing raw scores should use searchProjectSpacesWithScore().
 */
export function searchProjectSpaces(query) {
  return searchProjectSpacesWithScore(query).map((r) => r.space);
}

/**
 * Tokenized + phrase-aware search. Each token is scored independently;
 * exact alias hits score highest. Returns {space, score}[] sorted desc.
 */
export function searchProjectSpacesWithScore(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const tokens = extractSearchTokens(q);
  if (tokens.length === 0) return [];

  const results = [];
  for (const space of spacesById.values()) {
    let score = 0;
    const labelLow = space.human_label.toLowerCase();
    const repoLow = (space.repo_name || '').toLowerCase();
    const summaryLow = space.canonical_summary.toLowerCase();
    const aliasesLow = space.aliases.map((a) => a.toLowerCase());

    for (const alias of aliasesLow) {
      if (alias === q) { score += 20; break; }
    }

    for (const token of tokens) {
      for (const alias of aliasesLow) {
        if (alias === token) { score += 15; break; }
        if (alias.includes(token)) { score += 6; break; }
      }
      if (labelLow === token) score += 12;
      else if (labelLow.includes(token)) score += 8;
      if (repoLow && repoLow === token) score += 12;
      else if (repoLow && repoLow.includes(token)) score += 7;
      if (summaryLow.includes(token)) score += 2;
    }

    if (score > 0) results.push({ space, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

const STOP_WORDS = new Set([
  '그', '이', '저', '에', '를', '을', '의', '로', '에서', '하고', '해줘', '해',
  '반영', '피드백', '기존', '지난번', '이전에', '프로젝트', '앱', '서비스',
  'the', 'a', 'an', 'that', 'this', 'project', 'app', 'existing', 'previous',
]);

/**
 * 라벨 exact 비교용 (소문자·공백·구두점 정규화).
 * @param {string} text
 */
export function normalizeLabelForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/["""''「」\[\](){}!?.,;:~@#$%^&*+=<>/\\|`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * goal line 보조 신호 — 토큰 집합 정렬 후 연결 (유사도 스코어만으로의 재사용 대체용).
 * @param {string} goalLine
 */
export function computeGoalFingerprint(goalLine) {
  const tokens = extractSearchTokens(String(goalLine || '').toLowerCase());
  if (tokens.length === 0) return '';
  return [...new Set(tokens)].sort().join('|');
}

/**
 * 다른 thread에 **active** run이 붙어 있으면 true (현재 thread는 제외).
 * @param {object} space
 * @param {string} currentThreadKey
 */
export function spaceHasActiveRunOnOtherThread(space, currentThreadKey) {
  if (!space?.active_run_ids?.length) return false;
  for (const rid of space.active_run_ids) {
    const run = getExecutionRunById(rid);
    if (!run || run.status !== 'active') continue;
    const ok = run.owner_thread_key && run.owner_thread_key !== currentThreadKey;
    if (ok) return true;
  }
  return false;
}

/**
 * exact 라벨 또는 exact alias 일치하는 스페이스 후보 (점수 정렬 아님).
 * @param {string} goalLine
 * @returns {Array<{ space: object, match_kind: 'label_exact' | 'alias_exact' }>}
 */
export function findExactLabelOrAliasMatches(goalLine) {
  const norm = normalizeLabelForMatch(goalLine);
  if (norm.length < 2) return [];
  const out = [];
  for (const space of spacesById.values()) {
    let match_kind = null;
    if (normalizeLabelForMatch(space.human_label) === norm) match_kind = 'label_exact';
    else {
      for (const a of space.aliases || []) {
        if (normalizeLabelForMatch(a) === norm) {
          match_kind = 'alias_exact';
          break;
        }
      }
    }
    if (match_kind) out.push({ space, match_kind });
  }
  return out;
}

/**
 * trace용: 재사용하지 않기로 했을 때만 상위 유사 후보 요약.
 * @param {string} label
 * @param {number} limit
 */
export function getRelatedSpaceCandidatesForTrace(label, limit = 5) {
  return searchProjectSpacesWithScore(label)
    .slice(0, limit)
    .map((r) => ({
      project_id: r.space.project_id,
      human_label: r.space.human_label,
      score: r.score,
    }));
}

/**
 * launch/bootstrap 후 스레드·goal 흔적 갱신 (오케스트레이션 가시성).
 */
export function touchProjectSpaceLaunchMeta(projectId, { threadKey, goalFingerprint } = {}) {
  const space = spacesById.get(projectId);
  if (!space) return null;
  const patch = {
    last_thread_key: threadKey != null ? threadKey : space.last_thread_key,
    last_launch_at: now(),
  };
  if (goalFingerprint) patch.last_goal_fingerprint = goalFingerprint;
  return updateProjectSpace(projectId, patch);
}

/** owner_thread + active run owner_thread_key 기준 고유 스레드 수 */
export function countDistinctThreadsForSpace(space) {
  if (!space) return 0;
  const keys = new Set(space.owner_thread_ids || []);
  for (const rid of space.active_run_ids || []) {
    const run = getExecutionRunById(rid);
    if (run?.status === 'active' && run.owner_thread_key) keys.add(run.owner_thread_key);
  }
  return keys.size;
}

function extractSearchTokens(text) {
  return text
    .replace(/["""''「」\[\](){}!?.,;:~@#$%^&*+=<>/\\|`]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
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

/**
 * Render a compact, founder-facing project space status for Slack.
 * Shows real infra/status truth — not just labels.
 */
/**
 * Compact founder-facing project space status for Slack.
 * @param {object} space
 * @param {{ runs?: object[] }} opts - optional active run objects for inline status
 */
export function renderProjectSpaceStatusForSlack(space, opts = {}) {
  if (!space) return '[COS] 프로젝트 공간을 찾을 수 없습니다.';
  const lines = [
    `*[프로젝트 상태]*`,
    `\`${space.project_id}\` · ${space.human_label || '(라벨 없음)'}`,
    '',
  ];

  const ghStatus = space.github_ready_status === 'ready'
    ? `✅ ${space.repo_owner}/${space.repo_name}`
    : `⚠️ ${space.github_ready_status || 'not_configured'}`;
  lines.push(`*GitHub*: ${ghStatus}`);

  const cursorStatus = space.cursor_workspace_root ? '✅ 연결됨' : '⚠️ 미설정';
  lines.push(`*Cursor*: ${cursorStatus}${space.cursor_handoff_root ? ` · handoff: ${space.cursor_handoff_root}` : ''}`);

  const supaStatus = space.supabase_ready_status === 'configured'
    ? `✅ ${space.supabase_project_ref || ''}`
    : `⚠️ ${space.supabase_ready_status || 'not_configured'}`;
  lines.push(`*Supabase*: ${supaStatus}`);

  const vercelStatus = space.vercel_ready_status === 'ready'
    ? `✅ ${space.vercel_project_id || ''}`
    : `⚠️ ${space.vercel_ready_status || 'not_configured'}`;
  lines.push(`*Vercel*: ${vercelStatus}`);

  const railwayStatus = space.railway_ready_status === 'ready'
    ? `✅ ${space.railway_service_id || space.railway_project_id || ''}`
    : `⚠️ ${space.railway_ready_status || 'not_configured'}`;
  lines.push(`*Railway*: ${railwayStatus}`);

  lines.push('');
  const runCount = space.active_run_ids?.length || 0;
  lines.push(`*실행 현황*: run ${runCount}개`);

  const runs = opts.runs || [];
  for (const run of runs.slice(0, 3)) {
    const stage = run.current_stage || 'unknown';
    const goal = String(run.project_goal || '').slice(0, 50);
    const deploy = run.deploy_status && run.deploy_status !== 'none' ? ` · deploy: ${run.deploy_status}` : '';
    lines.push(`  └ \`${run.run_id}\` ${goal} — ${stage}${deploy}`);
  }
  if (runs.length > 3) lines.push(`  └ ... +${runs.length - 3}개 더`);

  lines.push(`*부트스트랩*: ${space.last_bootstrap_status || 'not_bootstrapped'}`);
  lines.push(`*배포 상태*: ${space.last_deploy_status || 'none'}${space.last_deploy_at ? ` (${space.last_deploy_at})` : ''}`);

  return lines.join('\n');
}

export function _resetForTest() {
  spacesById.clear();
  threadIndex.clear();
}
