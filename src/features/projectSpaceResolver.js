/**
 * Project Space Resolver — thread/text/metadata로부터 기존 project space를 찾거나 unresolved 반환.
 *
 * 우선순위:
 *  1. explicit project_id
 *  2. thread-linked project
 *  3. exact alias/repo/label hit (high confidence)
 *  4. fuzzy multi-token match (medium confidence)
 *  5. none → unresolved
 */

import {
  getProjectSpaceById,
  getProjectSpaceByThread,
  searchProjectSpacesWithScore,
} from './projectSpaceRegistry.js';

const CONFIDENCE_THRESHOLD = 10;

/**
 * @param {{ threadKey?: string, text?: string, metadata?: Record<string, unknown> }} ctx
 * @returns {{ resolved: boolean, project_id?: string, space?: object, candidates?: object[], reason: string, confidence?: number }}
 */
export function resolveProjectSpaceForThread({ threadKey, text, metadata } = {}) {
  const explicitId = metadata?.project_id;
  if (explicitId) {
    const space = getProjectSpaceById(explicitId);
    if (space) return { resolved: true, project_id: space.project_id, space, reason: 'explicit_id', confidence: 100 };
    return { resolved: false, reason: 'explicit_id_not_found', candidates: [] };
  }

  if (threadKey) {
    const space = getProjectSpaceByThread(threadKey);
    if (space) return { resolved: true, project_id: space.project_id, space, reason: 'thread_linked', confidence: 100 };
  }

  if (text) {
    const phrases = extractProjectReferencePhrases(text);
    const queryText = phrases.length ? phrases.join(' ') : text;
    const scored = searchProjectSpacesWithScore(queryText);

    if (scored.length === 0) {
      return { resolved: false, reason: 'unresolved', candidates: [] };
    }

    const top = scored[0];
    if (scored.length === 1 && top.score >= CONFIDENCE_THRESHOLD) {
      return { resolved: true, project_id: top.space.project_id, space: top.space, reason: 'search_unique', confidence: top.score };
    }

    if (scored.length >= 2) {
      const gap = top.score - scored[1].score;
      if (top.score >= CONFIDENCE_THRESHOLD && gap >= 5) {
        return { resolved: true, project_id: top.space.project_id, space: top.space, reason: 'search_dominant', confidence: top.score };
      }
      return {
        resolved: false,
        reason: 'ambiguous',
        candidates: scored.slice(0, 5).map((s) => ({ ...s.space, _score: s.score })),
      };
    }

    if (top.score < CONFIDENCE_THRESHOLD) {
      return {
        resolved: false,
        reason: 'low_confidence',
        candidates: scored.slice(0, 3).map((s) => ({ ...s.space, _score: s.score })),
      };
    }

    return { resolved: true, project_id: top.space.project_id, space: top.space, reason: 'search_unique', confidence: top.score };
  }

  return { resolved: false, reason: 'unresolved', candidates: [] };
}

const PHRASE_RE = /(?:["'「]([^"'」]+)["'」])|(?:(?:슬랙|slack)\s*cos)|(?:(?:gallery|갤러리|calendar|캘린더|dashboard|대시보드)\s*(?:앱|app|프로젝트|project)?)|(?:[a-z0-9][-a-z0-9_.]{2,})/gi;

function extractProjectReferencePhrases(text) {
  const raw = String(text || '');
  const phrases = [];
  let m;
  while ((m = PHRASE_RE.exec(raw)) !== null) {
    const phrase = (m[1] || m[0]).trim();
    if (phrase.length >= 2) phrases.push(phrase);
  }
  return phrases;
}

const NEW_PROJECT_RE = /새\s*(?:프로젝트|앱|서비스|space)|new\s*(?:project|app|service|space)|만들자|시작하자/i;
const EXISTING_REF_RE = /지난번|그\s*프로젝트|기존|이전에|그\s*앱|that\s*project|existing|반영해/i;

/**
 * Detect whether the user intent is "new project" or "existing project reference".
 */
export function detectProjectIntent(text) {
  if (NEW_PROJECT_RE.test(text)) return 'new_project';
  if (EXISTING_REF_RE.test(text)) return 'existing_reference';
  return null;
}

/**
 * Render an ambiguous/unresolved project resolution for Slack.
 */
export function renderProjectResolutionSurface(result) {
  if (result.resolved) {
    return `기존 프로젝트에 연결됨: \`${result.space.human_label || result.project_id}\` (\`${result.project_id}\`)`;
  }

  if (result.reason === 'ambiguous' && result.candidates?.length) {
    const lines = [
      '*[프로젝트 식별 필요]*',
      '여러 프로젝트가 매칭됩니다. 어떤 프로젝트인지 지정해주세요:',
      '',
    ];
    for (let i = 0; i < result.candidates.length; i++) {
      const c = result.candidates[i];
      lines.push(`${i + 1}. \`${c.human_label || c.project_id}\`${c.repo_name ? ` (repo: ${c.repo_name})` : ''}`);
    }
    lines.push('', '_프로젝트 이름이나 별칭을 정확히 말씀해주시면 연결합니다._');
    return lines.join('\n');
  }

  if (result.reason === 'low_confidence' && result.candidates?.length) {
    const c = result.candidates[0];
    return [
      '*[프로젝트 확인 필요]*',
      `혹시 \`${c.human_label || c.project_id}\` 프로젝트를 말씀하시는 건가요?`,
      '_맞으면 프로젝트 이름을 다시 말씀해주세요._',
    ].join('\n');
  }

  return [
    '*[프로젝트 미식별]*',
    '매칭되는 기존 프로젝트를 찾지 못했습니다.',
    '_프로젝트 이름, 별칭, 또는 레포 이름을 알려주시면 연결합니다._',
  ].join('\n');
}
