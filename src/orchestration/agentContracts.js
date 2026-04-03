/**
 * vNext.12 — Harness agent roles (bounded privilege; COS orchestrates).
 */

export const AGENT_ROLES = {
  cos_planner: {
    id: 'cos_planner',
    may_invoke_tools: false,
    may_mutate_external: false,
    notes: 'North star, scope lock, route graph only',
  },
  research_agent: {
    id: 'research_agent',
    may_invoke_tools: ['internal_artifact'],
    may_mutate_external: false,
  },
  fullstack_swe: {
    id: 'fullstack_swe',
    may_invoke_tools: ['github', 'cursor_cloud'],
    may_mutate_external: true,
  },
  db_ops: {
    id: 'db_ops',
    may_invoke_tools: ['supabase_dispatch'],
    may_mutate_external: true,
  },
  uiux_designer: {
    id: 'uiux_designer',
    may_invoke_tools: ['internal_artifact'],
    may_mutate_external: false,
  },
  qa_agent: {
    id: 'qa_agent',
    may_invoke_tools: ['internal_artifact'],
    may_mutate_external: false,
  },
  deploy_ops: {
    id: 'deploy_ops',
    may_invoke_tools: ['vercel', 'railway', 'internal_artifact'],
    may_mutate_external: true,
  },
  audit_reconciliation_agent: {
    id: 'audit_reconciliation_agent',
    may_invoke_tools: ['internal_artifact'],
    may_mutate_external: false,
    notes: 'Tool-state diff vs plan; no self-report as truth',
  },
};
