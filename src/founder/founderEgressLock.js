/**
 * vNext.13.14 — Founder Slack egress는 `sendFounderResponse` 단일 출구 계약.
 * 다른 모듈이 founder_route 메타와 함께 직접 `chat.postMessage` 등을 호출하려 할 때 방어(테스트·수동 호출용).
 */

/**
 * @param {Record<string, unknown>|undefined} metadata
 * @param {string} caller — 실제 Slack API를 호출하는 함수/모듈 식별자. 허용: `sendFounderResponse`
 */
export function assertFounderEgressOnly(metadata, caller) {
  if (metadata?.founder_route !== true) return;
  if (caller !== 'sendFounderResponse') {
    const err = new Error('founder_egress_bypass_detected');
    err.code = 'founder_egress_bypass_detected';
    throw err;
  }
}
