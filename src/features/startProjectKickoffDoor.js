/**
 * Clean COS Front Door — `start_project` 킥오프를 lineage·Council 이전에 고정하고,
 * 스레드 푸시백 시 이전 사용자 `툴제작` 문맥을 회수한다.
 */

import { buildSlackThreadKey, getConversationTranscript } from './slackConversationBuffer.js';
import { stripLeadingCouncilPrefix } from '../slack/councilCommandPrefixes.js';
import { isStartProjectKickoffInput } from './surfaceIntentClassifier.js';

/** @param {string} t */
function isKickoffAlignmentPushback(t) {
  const s = String(t || '').trim();
  if (s.length < 8) return false;
  if (isStartProjectKickoffInput(s)) return false;
  return (
    /기준안|먼저.*보여|필요한\s*질문만|질문만\s*(해|하|달라)|그니까|그러니까/u.test(s) &&
    (/질문|먼저|기준|정리|답변|장문|전부/u.test(s) || /말이\s*너무|너무\s*길/u.test(s))
  );
}

/**
 * transcript: `getConversationTranscript` 형식 (`[사용자]` / `[COS]` 블록).
 * @returns {string[]}
 */
function parseTranscriptUserChunks(transcript) {
  const t = String(transcript || '').trim();
  if (!t) return [];
  const chunks = t.split(/\n\n(?=\[)/u);
  /** @type {string[]} */
  const out = [];
  const pref = '[사용자]\n';
  for (const c of chunks) {
    if (c.startsWith(pref)) {
      out.push(c.slice(pref.length).trim());
    }
  }
  return out;
}

/**
 * 스레드에서 가장 최근 킥오프로 분류되는 사용자 메시지를 찾는다.
 * @param {string} transcript
 * @returns {string | null}
 */
export function extractLatestStartProjectUserLineFromTranscript(transcript) {
  const users = parseTranscriptUserChunks(transcript);
  for (let i = users.length - 1; i >= 0; i -= 1) {
    const u = users[i];
    if (isStartProjectKickoffInput(u)) return u;
  }
  return null;
}

/**
 * @typedef {{ line: string, toneAck: string | null }} CleanStartProjectKickoff
 */

/**
 * decision short·lineage 이전에 호출: 직접 킥오프 또는 푸시백 + 스레드 맥락.
 * @param {string} trimmed
 * @param {Record<string, unknown>} [metadata]
 * @returns {CleanStartProjectKickoff | null}
 */
export function resolveCleanStartProjectKickoff(trimmed, metadata = undefined) {
  const t = String(trimmed || '').trim();
  if (!t) return null;

  if (isStartProjectKickoffInput(t)) {
    return { line: t, toneAck: null };
  }

  const { stripped: afterCouncil, hadPrefix } = stripLeadingCouncilPrefix(t);
  if (hadPrefix && afterCouncil && isStartProjectKickoffInput(afterCouncil)) {
    return { line: afterCouncil, toneAck: null };
  }

  if (!metadata || typeof metadata !== 'object') return null;
  if (!isKickoffAlignmentPushback(t)) return null;

  const key = buildSlackThreadKey(metadata);
  const prior = getConversationTranscript(key);
  const recovered = extractLatestStartProjectUserLineFromTranscript(prior);
  if (!recovered) return null;

  return {
    line: recovered,
    toneAck: '말씀 주신 대로, 기준안을 먼저 두고 질문은 핵심만 정리했습니다.',
  };
}

export { isKickoffAlignmentPushback };
