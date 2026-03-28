/**
 * 에이전트 툴 레지스트리 v0 — 선언 + `pipeline` / `gate_policy` 로 런타임(`cosToolRuntime`·텔레메트리)과 정렬.
 * @see cosToolTelemetry.js · cosToolRuntime.js
 *
 * @typedef {'align'|'agree'|'plan'|'execute'} CosWorkflowPhase
 * @typedef {'human_led'|'cos_led_after_agreement'} CosToolAutonomy
 * @typedef {'low'|'medium'|'high'} CosToolRisk
 * @typedef {'none'|'apr_flow'|'high_risk_execute'} CosToolGatePolicy
 * @typedef {'pre_ai_query'|'pre_ai_planner'|'ai_navigator'|'ai_council'|'structured_execute'|'slack_interactive_apr'} CosToolPipeline
 *
 * @typedef {{
 *   id: string,
 *   phase: CosWorkflowPhase,
 *   title: string,
 *   description: string,
 *   example_user_text: string,
 *   autonomy: CosToolAutonomy,
 *   risk: CosToolRisk,
 *   gate_policy: CosToolGatePolicy,
 *   pipeline: CosToolPipeline,
 * }} CosToolDescriptor
 */

/** @type {CosToolDescriptor[]} */
export const COS_TOOL_REGISTRY_V0 = [
  {
    id: 'navigator',
    phase: 'align',
    title: 'COS 내비게이터',
    description: '의도 정리·질문·합의·이행 단계 안내',
    example_user_text: 'COS (상황 서술)',
    autonomy: 'human_led',
    risk: 'low',
    gate_policy: 'none',
    pipeline: 'ai_navigator',
  },
  {
    id: 'council',
    phase: 'align',
    title: '협의모드 (다각 논의)',
    description: '페르소나별 관점·합성',
    example_user_text: '협의모드: (질문)',
    autonomy: 'human_led',
    risk: 'low',
    gate_policy: 'none',
    pipeline: 'ai_council',
  },
  {
    id: 'plan_register',
    phase: 'plan',
    title: '계획 등록',
    description: 'PLN·연결 WRK 초안',
    example_user_text: '계획등록: (목표)',
    autonomy: 'cos_led_after_agreement',
    risk: 'medium',
    gate_policy: 'apr_flow',
    pipeline: 'pre_ai_planner',
  },
  {
    id: 'plan_query',
    phase: 'plan',
    title: '계획/업무 조회',
    description: '상태 QC, Council 없음',
    example_user_text: '계획상세 PLN-…',
    autonomy: 'cos_led_after_agreement',
    risk: 'low',
    gate_policy: 'none',
    pipeline: 'pre_ai_query',
  },
  {
    id: 'g1cos_lineage',
    phase: 'plan',
    title: 'G1COS lineage (턴·패킷·워크큐)',
    description: '감사 스냅샷·큐 목록/대기·trace 읽기 전용',
    example_user_text: '/g1cos 워크큐 목록 · 패킷 PKT-… · 턴 <uuid>',
    autonomy: 'cos_led_after_agreement',
    risk: 'low',
    gate_policy: 'none',
    pipeline: 'pre_ai_query',
  },
  {
    id: 'work_dispatch',
    phase: 'execute',
    title: '업무 디스패치 (Cursor/GitHub)',
    description: '핸드오프·이슈 발행',
    example_user_text: '커서발행 WRK-… / 이슈발행 WRK-…',
    autonomy: 'cos_led_after_agreement',
    risk: 'high',
    gate_policy: 'high_risk_execute',
    pipeline: 'structured_execute',
  },
  {
    id: 'approval_gate',
    phase: 'agree',
    title: '승인 게이트',
    description: 'APR·플래너 승인',
    example_user_text: '승인 APR-…',
    autonomy: 'human_led',
    risk: 'medium',
    gate_policy: 'apr_flow',
    pipeline: 'structured_execute',
  },
];

/** @param {CosWorkflowPhase} phase */
export function listToolsByPhase(phase) {
  return COS_TOOL_REGISTRY_V0.filter((t) => t.phase === phase);
}
