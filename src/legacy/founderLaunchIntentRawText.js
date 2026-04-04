/**
 * LEGACY / REGRESSION ONLY — raw founder text → launch intent (regex).
 * Production founder path must not import this module. vNext.13.5 seal.
 */

import { isActiveProjectIntake, hasOpenExecutionOwnership } from '../features/projectIntakeSession.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { getExecutionRunByThread } from '../features/executionRun.js';

/**
 * @param {string} normalized
 * @param {Record<string, unknown>} metadata
 * @param {string} threadKey
 * @returns {{ detected: boolean, signal: string | null, reason?: string }}
 */
export function detectFounderLaunchIntentRawText(normalized, metadata, threadKey) {
  const t = String(normalized || '').trim();
  if (t.length < 2) return { detected: false, signal: null, reason: 'empty' };

  const hasContext =
    isActiveProjectIntake(metadata) ||
    hasOpenExecutionOwnership(metadata) ||
    Boolean(getProjectSpaceByThread(threadKey)) ||
    Boolean(getExecutionRunByThread(threadKey));

  if (!hasContext) {
    return { detected: false, signal: null, reason: 'no_thread_context' };
  }

  if (/^(어떻게|왜|뭘|무엇을|언제|어디서)\s+/u.test(t) && t.length < 50) {
    return { detected: false, signal: null, reason: 'question_like' };
  }

  const patterns = [
    { re: /좋아\s*[,.]?\s*진행\s*하자/u, signal: 'affirm_progress' },
    { re: /진행\s*하자/u, signal: 'progress' },
    { re: /개시/u, signal: 'start' },
    { re: /오케스트레이션.*들어가/u, signal: 'orchestration' },
    { re: /작업\s*(을\s*)?등록.*(시작|개시)/u, signal: 'work_register_start' },
    { re: /실행\s*넘겨/u, signal: 'handoff_exec' },
    { re: /바로\s*(개시|진행|시작)/u, signal: 'immediate_start' },
    { re: /등록하고\s*(시작|개시)/u, signal: 'register_start' },
    { re: /이\s*방향으로\s*실행/u, signal: 'direction_execute' },
    { re: /실행(?:으로)?\s*넘어가/u, signal: 'execute_transition' },
  ];

  for (const { re, signal } of patterns) {
    if (re.test(t)) return { detected: true, signal };
  }

  return { detected: false, signal: null, reason: 'no_phrase_match' };
}
