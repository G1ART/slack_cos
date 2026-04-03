/**
 * vNext.12 — Capability execution constitution (planner + executor + reconciliation).
 * 판정 신호 정본은 `runCapabilityExtractor.js`; 본 카탈로그는 실행 계약 메타데이터.
 */

/** @typedef {'live'|'draft'|'preview'|'observe_only'} ExecutionMode */

/**
 * @typedef {{
 *   owning_agent: string,
 *   allowed_providers: string[],
 *   default_execution_mode: ExecutionMode,
 *   forbidden_actions: string[],
 *   expected_artifacts: string[],
 *   truth_source: string,
 *   planner_notes?: string,
 * }} CapabilityExecutionContract
 */

/** @type {Record<string, CapabilityExecutionContract>} */
export const CAPABILITY_EXECUTION_CONTRACTS = {
  research: {
    owning_agent: 'research_agent',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['github_push', 'supabase_apply', 'vercel_deploy'],
    expected_artifacts: ['research_note_path'],
    truth_source: 'internal_artifact',
  },
  spec_refine: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['spec_outline_path'],
    truth_source: 'internal_artifact',
  },
  fullstack_code: {
    owning_agent: 'fullstack_swe',
    allowed_providers: ['github', 'cursor_cloud'],
    default_execution_mode: 'live',
    forbidden_actions: ['supabase_apply', 'vercel_deploy', 'railway_deploy'],
    expected_artifacts: ['github_issue_or_draft', 'branch_or_handoff', 'cursor_live_or_handoff'],
    truth_source: 'github_then_cursor_trace',
  },
  db_schema: {
    owning_agent: 'db_ops',
    allowed_providers: ['supabase_dispatch'],
    default_execution_mode: 'draft',
    forbidden_actions: ['github_force_push', 'vercel_prod_deploy'],
    expected_artifacts: ['schema_draft', 'migration_stub', 'optional_apply_ref'],
    truth_source: 'supabase_trace',
  },
  db_data: {
    owning_agent: 'db_ops',
    allowed_providers: ['supabase_dispatch'],
    default_execution_mode: 'draft',
    forbidden_actions: ['github_force_push'],
    expected_artifacts: ['data_migration_or_seed_stub'],
    truth_source: 'supabase_trace',
  },
  uiux_design: {
    owning_agent: 'uiux_designer',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['supabase_apply', 'production_deploy'],
    expected_artifacts: ['ui_spec', 'wireframe', 'components'],
    truth_source: 'internal_artifact',
  },
  deploy_preview: {
    owning_agent: 'deploy_ops',
    allowed_providers: ['vercel', 'railway', 'observe_only'],
    default_execution_mode: 'preview',
    forbidden_actions: ['schema_drop', 'raw_prod_secret_write'],
    expected_artifacts: [
      'vercel_packet_path or vercel_preview_url',
      'railway_packet_path or railway_deploy_url',
      'observe_summary_path (observe_only)',
    ],
    truth_source: 'vercel_or_railway_packet_or_observe_summary',
    planner_notes: 'Reconciliation: deploy_preview/vercel|railway|observe_only 각각 expected ref 충족 시 satisfied',
  },
  qa_validation: {
    owning_agent: 'qa_agent',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['acceptance', 'regression', 'smoke'],
    truth_source: 'internal_artifact',
  },
  docs_handoff: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['handoff_markdown'],
    truth_source: 'internal_artifact',
  },
  external_reporting: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'observe_only',
    forbidden_actions: ['unscoped_external_write'],
    expected_artifacts: ['report_stub'],
    truth_source: 'internal_artifact',
  },
  /** vNext.13 — 업무·오퍼레이션(내부 아티팩트만; 외부 액추에이터 전 기본 금지) */
  market_research: {
    owning_agent: 'research_agent',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation', 'github_push', 'supabase_apply'],
    expected_artifacts: ['research_memo', 'comparison_table'],
    truth_source: 'internal_artifact',
  },
  strategy_memo: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['strategy_memo_path'],
    truth_source: 'internal_artifact',
  },
  document_write: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['document_draft_path'],
    truth_source: 'internal_artifact',
  },
  document_review: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['review_notes_path'],
    truth_source: 'internal_artifact',
  },
  budget_planning: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['budget_outline_path'],
    truth_source: 'internal_artifact',
  },
  financial_scenario: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['scenario_table_path'],
    truth_source: 'internal_artifact',
  },
  ir_deck: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['deck_outline_path'],
    truth_source: 'internal_artifact',
  },
  investor_research: {
    owning_agent: 'research_agent',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['investor_memo_path'],
    truth_source: 'internal_artifact',
  },
  outreach_copy: {
    owning_agent: 'cos_planner',
    allowed_providers: ['internal_artifact'],
    default_execution_mode: 'draft',
    forbidden_actions: ['external_mutation'],
    expected_artifacts: ['copy_variants_path'],
    truth_source: 'internal_artifact',
  },
};

/** @deprecated vNext.12 — use CAPABILITY_EXECUTION_CONTRACTS */
export const CAPABILITY_AGENT_MAP = Object.fromEntries(
  Object.entries(CAPABILITY_EXECUTION_CONTRACTS).map(([k, v]) => [
    k,
    { agent: v.owning_agent, providers: v.allowed_providers, notes: v.planner_notes || '' },
  ]),
);
