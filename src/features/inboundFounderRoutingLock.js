/**
 * vNext.10 — Simple founder inputs must not enter Council / opaque AI paths.
 * @see patch vNext.10 routing lock spec
 *
 * GREP_INBOUND_FOUNDER_ROUTING_LOCK_MODULE — consumed at runInboundAiRouter entry
 * (import `classifyFounderRoutingLock` from `./inboundFounderRoutingLock.js`).
 */

import { normalizeSlackUserPayload } from '../slack/slackTextNormalize.js';
import { getBuildInfo } from '../runtime/buildInfo.js';

export const KICKOFF_TEST_PHRASE = '오늘부터 테스트용 작은 프로젝트 하나 시작하자';

const META_DEBUG_RE =
  /(responder|surface|sanitize|finalizeSlackResponse|founderSurfaceGuard|topLevelRouter|씽크|싱크)/i;
const META_QUESTION_HINT =
  /(메타|어떻게|무엇|동작|라우팅|설명|why|how|which\s+path|뭐(야|예요|임|에요)|알려|질문)/i;
const META_QUESTION_MARKERS = /[?？]|입니까|인가요|되나요|됩니까|일까요/;

/**
 * @param {string} trimmed normalizeSlackUserPayload 결과
 * @returns {{ kind: 'version'|'meta_debug'|'kickoff_test' } | null}
 */
export function classifyFounderRoutingLock(trimmed) {
  const t = String(trimmed || '').trim();
  if (!t) return null;

  if (/^(?:버전|version|runtime\s*status)$/i.test(t)) {
    return { kind: 'version' };
  }

  if (META_DEBUG_RE.test(t) && (META_QUESTION_HINT.test(t) || META_QUESTION_MARKERS.test(t))) {
    return { kind: 'meta_debug' };
  }

  const norm = normalizeSlackUserPayload(t);
  if (norm === normalizeSlackUserPayload(KICKOFF_TEST_PHRASE)) {
    return { kind: 'kickoff_test' };
  }

  return null;
}

/**
 * GREP: surfaceLineForFounderKickoffLock — `runInboundAiRouter` 의 `kickoff_test` 분기에서
 * `tryExecutiveSurfaceResponse` 가 executive / start_project 면으로 빠지도록 붙이는 접두.
 */
export function surfaceLineForFounderKickoffLock(trimmed) {
  return `툴제작: ${String(trimmed || '').trim()}`;
}

export function formatRuntimeMetaSurfaceText() {
  const bi = getBuildInfo();
  return [
    `*[G1 COS Runtime]*`,
    `- sha: \`${bi.release_sha_short}\` (\`${bi.release_sha}\`)`,
    `- branch: \`${bi.branch}\``,
    `- started_at: ${bi.started_at}`,
    `- pid: ${bi.pid}`,
    `- hostname: ${bi.hostname}`,
    `- runtime_mode: ${bi.runtime_mode}`,
    `- intake_persist: ${process.env.PROJECT_INTAKE_SESSION_PERSIST || '0'}`,
  ].join('\n');
}

export function formatMetaDebugSurfaceText() {
  return [
    '*[COS 운영 메타]*',
    'founder-facing 답변에서는 라우터·샌itizer 내부 경로를 펼치지 않습니다.',
    '런타임 SHA는 `버전` 또는 `/g1cos 버전`으로 확인해 주세요.',
  ].join('\n');
}
