/**
 * vNext.13.2 — 하네스 "스킬" 레지스트리: 고정 라우트가 아니라 COS planner가 on-demand로 패킷 attach.
 * Subagent 호출은 창업자 키워드가 아니라 승인된 제안·작업 목록 기준 (정책 문서와 정합).
 */

/** @typedef {{ id: string, summary: string, jit_context_refs: string[], typical_agents: string[] }} HarnessSkillDef */

/** @type {Record<string, HarnessSkillDef>} */
export const HARNESS_SKILLS_REGISTRY = {
  investor_thesis_fit_skill: {
    id: 'investor_thesis_fit_skill',
    summary: '펀드·테제·핏 매트릭스 — investor_research + strategy_writer 조합 시 attach',
    jit_context_refs: ['approved_task_ids', 'goal_line_hint', 'investor_segments'],
    typical_agents: ['investor_research_agent', 'strategy_writer'],
  },
  budget_scenario_skill: {
    id: 'budget_scenario_skill',
    summary: '공격/중립/보수 시나리오 가정·민감도 — finance_analyst 주도',
    jit_context_refs: ['approved_task_ids', 'runway_assumptions_ref'],
    typical_agents: ['finance_analyst_agent', 'strategy_writer'],
  },
  teardown_matrix_skill: {
    id: 'teardown_matrix_skill',
    summary: '경쟁사 벤치마크·차별화 축 — market_research + strategy_writer',
    jit_context_refs: ['competitor_list_ref', 'differentiation_axes'],
    typical_agents: ['market_research_agent', 'research_agent', 'strategy_writer'],
  },
  launch_readiness_skill: {
    id: 'launch_readiness_skill',
    summary: '런칭 전 체크리스트·kill point 정렬 — qa + deploy_ops + audit',
    jit_context_refs: ['provider_truth_snapshot_ref', 'run_id'],
    typical_agents: ['qa_agent', 'deploy_ops', 'audit_reconciliation_agent'],
  },
  reconciliation_audit_skill: {
    id: 'reconciliation_audit_skill',
    summary: '툴 truth 대조·self-report 불신 — audit_reconciliation_agent',
    jit_context_refs: ['truth_reconciliation_ref', 'tool_refs'],
    typical_agents: ['audit_reconciliation_agent'],
  },
  deck_storyline_skill: {
    id: 'deck_storyline_skill',
    summary: 'IR 덱 서사·슬라이드 순서·세그먼트 톤 — COS_ONLY 우선, internal artifact',
    jit_context_refs: ['narrative_goal', 'deck_outline_ref'],
    typical_agents: ['strategy_writer', 'outreach_writer'],
  },
};

export const HARNESS_SKILL_IDS = Object.keys(HARNESS_SKILLS_REGISTRY);
