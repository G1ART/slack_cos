/**
 * Project Space Resolver — thread/text/metadata로부터 기존 project space를 찾거나 unresolved 반환.
 *
 * 우선순위:
 *  1. explicit project_id
 *  2. thread-linked project
 *  3. alias exact match
 *  4. repo_name / human_label fuzzy match
 *  5. none → unresolved
 */

import {
  getProjectSpaceById,
  getProjectSpaceByThread,
  searchProjectSpaces,
} from './projectSpaceRegistry.js';

/**
 * @param {{ threadKey?: string, text?: string, metadata?: Record<string, unknown> }} ctx
 * @returns {{ resolved: boolean, project_id?: string, space?: object, candidates?: object[], reason: string }}
 */
export function resolveProjectSpaceForThread({ threadKey, text, metadata } = {}) {
  const explicitId = metadata?.project_id;
  if (explicitId) {
    const space = getProjectSpaceById(explicitId);
    if (space) return { resolved: true, project_id: space.project_id, space, reason: 'explicit_id' };
    return { resolved: false, reason: 'explicit_id_not_found', candidates: [] };
  }

  if (threadKey) {
    const space = getProjectSpaceByThread(threadKey);
    if (space) return { resolved: true, project_id: space.project_id, space, reason: 'thread_linked' };
  }

  if (text) {
    const candidates = searchProjectSpaces(text);
    if (candidates.length === 1) {
      return { resolved: true, project_id: candidates[0].project_id, space: candidates[0], reason: 'search_unique' };
    }
    if (candidates.length > 1) {
      return { resolved: false, reason: 'ambiguous', candidates: candidates.slice(0, 5) };
    }
  }

  return { resolved: false, reason: 'unresolved', candidates: [] };
}

const NEW_PROJECT_RE = /새\s*(?:프로젝트|앱|서비스|space)|new\s*(?:project|app|service|space)|만들자|시작하자/i;
const EXISTING_REF_RE = /지난번|그\s*프로젝트|기존|이전에|그\s*앱|that\s*project|existing/i;

/**
 * Detect whether the user intent is "new project" or "existing project reference".
 */
export function detectProjectIntent(text) {
  if (NEW_PROJECT_RE.test(text)) return 'new_project';
  if (EXISTING_REF_RE.test(text)) return 'existing_reference';
  return null;
}
