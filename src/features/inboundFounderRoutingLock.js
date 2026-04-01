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
 * 멘션 제거 뒤에도 남는 `G1COS 버전` / `G1COS버전` 등 → `버전`으로 접어 유틸 의도가 깨지지 않게 한다.
 * (surfaceIntentClassifier.stripSurfaceLineNoise 와 동계열, `G1COS` + 비공백 접두만 추가)
 */
export function normalizeFounderMetaCommandLine(raw) {
  let s = String(raw ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.normalize('NFKC').trim();
  // Slack 별표 bold — 유틸 한 줄(`*G1COS* 버전`)에서 접두 매칭이 깨지지 않게 제거
  s = s.replace(/\*+/g, '');
  s = s.replace(/^G1\s*COS(?=[\s\u00A0\u3000]*툴)/iu, '');
  s = s.replace(/^G1\s*COS\s+/iu, '');
  s = s.replace(/^G1\s*COS(?=\S)/iu, '');
  s = s.replace(/^G1\s*[.\-_]\s*COS\s+/iu, '');
  s = s.replace(/^(COS|비서)\s+/iu, '');
  for (let g = 0; g < 12; g += 1) {
    const prev = s;
    s = s.replace(/^>\s*/, '');
    s = s.replace(/^[-–—•∙·]\s*/, '');
    s = s.replace(/^\d{1,3}\.\s+/, '');
    s = s.replace(/^[*＊_＿]{1,4}(?=\S)/u, '');
    s = s.replace(/^[*＊_＿]+\s+/u, '');
    s = s.trim();
    if (s === prev) break;
  }
  return s.trim();
}

/**
 * @param {string} trimmed normalizeSlackUserPayload 결과
 * @returns {{ kind: 'version'|'meta_debug'|'kickoff_test' } | null}
 */
export function classifyFounderRoutingLock(trimmed) {
  const t = normalizeFounderMetaCommandLine(String(trimmed || '').trim());
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
