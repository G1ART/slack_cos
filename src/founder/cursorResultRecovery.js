/**
 * vNext.13.57 — Result recovery layer (read-only summaries). Dispatch lives in toolsBridge / webhook ingress.
 * Primary: verified Cursor webhook correlation. Secondary: GitHub / reflection signals (non-primary completion).
 */

/**
 * @param {Record<string, unknown> | null | undefined} ingressSafePayload cos_cursor_webhook_ingress_safe row payload subset
 */
export function summarizeRecoveryFromPrimaryCursorIngress(ingressSafePayload) {
  const p = ingressSafePayload && typeof ingressSafePayload === 'object' ? ingressSafePayload : {};
  const co = String(p.correlation_outcome || '');
  const verified =
    p.signature_verification_ok === true &&
    p.json_parse_ok === true &&
    co !== 'rejected_invalid_signature' &&
    co !== 'rejected_invalid_json';
  return {
    recovery_path: 'primary_cursor_webhook',
    verified_ingress: verified,
    correlation_outcome: co || null,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} githubEvidencePayload cos_github_fallback_evidence row payload subset
 */
export function summarizeRecoveryFromGithubSecondaryEvidence(githubEvidencePayload) {
  const p = githubEvidencePayload && typeof githubEvidencePayload === 'object' ? githubEvidencePayload : {};
  return {
    recovery_path: 'github_secondary_advisory',
    signal_seen: p.github_fallback_signal_seen === true,
    match_attempted: p.github_fallback_match_attempted === true,
    matched: p.github_fallback_matched === true,
    is_primary_completion_authority: false,
  };
}
