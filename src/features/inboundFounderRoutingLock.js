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

/** 파이프라인 유틸 강제와 동일 계열 키워드(질문형 없이도 meta_debug 락) */
const META_DEBUG_RE =
  /(responder|surface|sanitize|finalizeSlackResponse|founderSurfaceGuard|topLevelRouter|씽크|싱크|router|라우터|라우팅|pipeline|파이프라인)/i;

/**
 * @param {string} trimmed normalizeSlackUserPayload 결과
 * @returns {{ kind: 'version'|'meta_debug'|'kickoff_test' } | null}
 */
export function classifyFounderRoutingLock(trimmed) {
  const t = String(trimmed || '').trim();
  if (!t) return null;

  if (
    /^\s*버전\s*[。.!！…]*\s*$/u.test(t) ||
    /^\s*version\s*[!.…]*\s*$/i.test(t) ||
    /^\s*runtime\s*status\s*[!.…]*\s*$/i.test(t)
  ) {
    return { kind: 'version' };
  }

  if (META_DEBUG_RE.test(t)) {
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
  return '[COS 운영 메타] founder-facing에서는 내부 라우팅 경로를 노출하지 않으며 런타임 확인은 버전 명령으로만 제공합니다.';
}
