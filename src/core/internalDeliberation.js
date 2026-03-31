/**
 * COS Constitutional Reset — Internal deliberation object contract.
 * Council/partner/research/planner return this shape — never raw founder-facing strings.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §3
 */

// GREP_COS_CONSTITUTION_DELIBERATION

/**
 * @typedef {Object} DeliberationResult
 * @property {string} recommendation
 * @property {string[]} viewpoints
 * @property {string[]} objections
 * @property {string[]} risks
 * @property {string[]} tensions
 * @property {string[]} next_actions
 * @property {boolean} approval_needed
 * @property {string} [one_line_summary]
 * @property {boolean} [decision_needed]
 * @property {string} [decision_question]
 */

/**
 * Convert legacy `synthesizeCouncil` output to a `DeliberationResult`.
 */
export function synthesisToDeliberation(synthesis) {
  return {
    recommendation: synthesis.recommendation || '',
    viewpoints: Array.isArray(synthesis.viewpoints)
      ? synthesis.viewpoints
      : (synthesis.personaOutputs || [])
          .map((p) => p.one_line_summary)
          .filter(Boolean),
    objections: synthesis.objections
      ? [synthesis.objections].flat().filter(Boolean)
      : synthesis.strongestObjection
        ? [synthesis.strongestObjection]
        : [],
    risks: Array.isArray(synthesis.keyRisks) ? synthesis.keyRisks : [],
    tensions: Array.isArray(synthesis.unresolvedTensions) ? synthesis.unresolvedTensions : [],
    next_actions: Array.isArray(synthesis.nextActions) ? synthesis.nextActions : [],
    approval_needed: Boolean(synthesis.approvalNeeded ?? synthesis.approval_needed),
    one_line_summary: synthesis.oneLineSummary || synthesis.one_line_summary || '',
    decision_needed: Boolean(synthesis.decisionNeeded ?? synthesis.decision_needed),
    decision_question: synthesis.decisionQuestion || synthesis.decision_question || '',
  };
}

/**
 * Validate a deliberation object shape. Returns list of issues (empty = valid).
 */
export function validateDeliberation(obj) {
  const issues = [];
  if (!obj || typeof obj !== 'object') return ['not an object'];
  if (typeof obj.recommendation !== 'string') issues.push('recommendation must be string');
  for (const arr of ['viewpoints', 'objections', 'risks', 'tensions', 'next_actions']) {
    if (!Array.isArray(obj[arr])) issues.push(`${arr} must be array`);
  }
  if (typeof obj.approval_needed !== 'boolean') issues.push('approval_needed must be boolean');
  return issues;
}
