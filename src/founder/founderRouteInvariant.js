/**
 * vNext.13.3 — Founder 단일 진입 불변식 SSOT.
 * `app.js` · `runInboundAiRouter.js`만 이 모듈을 통해 founder_route를 계산한다.
 */

/**
 * @param {Record<string, unknown>} [metadata]
 * @returns {{ founder_route: boolean, founder_route_signals: Record<string, unknown> }}
 */
export function resolveFounderRouteDecision(metadata = {}) {
  const sourceType = String(metadata.source_type || '').toLowerCase();
  const routeLabel = String(metadata.slack_route_label || '').toLowerCase();
  const channel = String(metadata.channel || '');
  const founder_route =
    sourceType === 'direct_message' ||
    sourceType === 'channel_mention' ||
    routeLabel === 'dm_ai_router' ||
    routeLabel === 'mention_ai_router' ||
    channel.startsWith('D');
  return {
    founder_route,
    founder_route_signals: {
      source_type: metadata.source_type ?? null,
      slack_route_label: metadata.slack_route_label ?? null,
      channel_prefix: channel ? channel.slice(0, 1) : null,
      channel_is_dm: channel.startsWith('D'),
    },
  };
}

/**
 * 인바운드 audit / trace에 붙이는 정규화된 founder 진입 메타.
 * @param {Record<string, unknown>} [metadata]
 */
export function traceFounderRouteInvariant(metadata = {}) {
  const d = resolveFounderRouteDecision(metadata);
  return {
    founder_route: d.founder_route,
    founder_entry_ssot: 'src/founder/founderRouteInvariant.js',
    founder_route_signals: d.founder_route_signals,
  };
}
