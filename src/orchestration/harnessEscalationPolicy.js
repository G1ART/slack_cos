/**
 * vNext.13.2 — When COS/harness must return to founder; approval wording constants.
 */

export const ESCALATION_RETURN_TO_FOUNDER_CONDITIONS = [
  'scope_ambiguity_remains_high',
  'provider_truth_insufficient',
  'risk_too_high_for_autonomous_execution',
  'budget_ir_legal_compliance_sensitive',
  'deploy_or_prod_mutation_imminent',
  'conflicting_agent_findings',
  'qa_audit_disagreement',
];

export const FOUNDER_APPROVAL_WORDING = {
  before_approval: '이 범위로 실행 승인 부탁드립니다',
  after_approval: '실행을 시작했습니다',
  on_hold: '내부 초안·정리만 유지합니다',
  forbidden_before_approval: '실행하겠습니다',
};
