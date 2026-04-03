/**
 * vNext.12 — Stable keys for route_decisions ↔ dispatch ↔ reconciliation.
 */

/**
 * @param {{ capability: string, selected_provider: string }} d
 */
export function routeDecisionKey(d) {
  return `${d.capability}::${d.selected_provider}`;
}
