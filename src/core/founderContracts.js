/**
 * COS Constitution v1.1 — Founder-facing type contracts.
 * Center of gravity: work_object → work_phase → policy → packet → surface.
 * @see docs/architecture/COS_CONSTITUTION_v1.md
 */

// GREP_COS_CONSTITUTION_CONTRACTS

// ---------------------------------------------------------------------------
// Work Phase — the primary axis (replaces intent as center)
// ---------------------------------------------------------------------------

export const WorkPhase = Object.freeze({
  DISCOVER: 'discover',
  ALIGN: 'align',
  LOCK: 'lock',
  SEED: 'seed',
  EXECUTE: 'execute',
  REVIEW: 'review',
  APPROVE: 'approve',
  DEPLOY: 'deploy',
  MONITOR: 'monitor',
  EXCEPTION: 'exception',
  UTILITY: 'utility',
});

export const WORK_PHASE_VALUES = new Set(Object.values(WorkPhase));

// ---------------------------------------------------------------------------
// Founder Intent — supplementary signal, NOT the primary axis
// ---------------------------------------------------------------------------

export const FounderIntent = Object.freeze({
  RUNTIME_META: 'runtime_meta',
  META_DEBUG: 'meta_debug',
  PROJECT_KICKOFF: 'project_kickoff',
  PROJECT_CLARIFICATION: 'project_clarification',
  PROJECT_STATUS: 'project_status',
  EXECUTION_DECISION: 'execution_decision',
  DEPLOY_LINKAGE: 'deploy_linkage',
  DEPLOY_CONFIRMATION: 'deploy_confirmation',
  QUERY_LOOKUP: 'query_lookup',
  HELP: 'help',
  STRUCTURED_COMMAND: 'structured_command',
  COUNCIL_DELIBERATION: 'council_deliberation',
  PARTNER_DIALOG: 'partner_dialog',
  APPROVAL_ACTION: 'approval_action',
  UNKNOWN_EXPLORATORY: 'unknown_exploratory',
  UNKNOWN_INVALID: 'unknown_invalid',
});

export const FOUNDER_INTENT_VALUES = new Set(Object.values(FounderIntent));

// ---------------------------------------------------------------------------
// Surface Types — Meta/Utility + OS Surfaces + Executive Surfaces
// ---------------------------------------------------------------------------

export const FounderSurfaceType = Object.freeze({
  // Meta / Utility
  RUNTIME_META: 'runtime_meta_surface',
  META_DEBUG: 'meta_debug_surface',
  HELP: 'help_surface',
  SAFE_FALLBACK: 'safe_fallback_surface',
  DISCOVERY: 'discovery_surface',

  // OS Surfaces
  PROJECT_SPACE: 'project_space_surface',
  RUN_STATE: 'run_state_surface',
  EXECUTION_PACKET: 'execution_packet_surface',
  APPROVAL_PACKET: 'approval_packet_surface',
  DEPLOY_PACKET: 'deploy_packet_surface',
  MANUAL_BRIDGE: 'manual_bridge_surface',
  MONITORING: 'monitoring_surface',
  EXCEPTION: 'exception_surface',
  EVIDENCE: 'evidence_surface',

  // Executive Surfaces
  EXECUTIVE_KICKOFF: 'executive_kickoff_surface',
  EXECUTIVE_STATUS: 'executive_status_surface',
  DECISION_PACKET: 'decision_packet_surface',
  STRUCTURED_COMMAND: 'structured_command_surface',
  QUERY: 'query_surface',
});

export const FOUNDER_SURFACE_VALUES = new Set(Object.values(FounderSurfaceType));

/**
 * Surface Freedom Levels
 * L0: strict packet (fixed template, no free-form)
 * L1: semi-structured (template + structured sections)
 * L2: bounded narrative (template + controlled expressive body)
 */
export const SurfaceFreedomLevel = Object.freeze({
  L0_STRICT: 'L0',
  L1_SEMI: 'L1',
  L2_NARRATIVE: 'L2',
});

export const SURFACE_FREEDOM_MAP = Object.freeze({
  [FounderSurfaceType.RUNTIME_META]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.SAFE_FALLBACK]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.EXECUTION_PACKET]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.APPROVAL_PACKET]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.DEPLOY_PACKET]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.EXCEPTION]: SurfaceFreedomLevel.L0_STRICT,
  [FounderSurfaceType.DECISION_PACKET]: SurfaceFreedomLevel.L0_STRICT,

  [FounderSurfaceType.HELP]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.PROJECT_SPACE]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.RUN_STATE]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.MANUAL_BRIDGE]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.MONITORING]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.EVIDENCE]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.EXECUTIVE_KICKOFF]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.EXECUTIVE_STATUS]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.STRUCTURED_COMMAND]: SurfaceFreedomLevel.L1_SEMI,
  [FounderSurfaceType.QUERY]: SurfaceFreedomLevel.L1_SEMI,

  [FounderSurfaceType.META_DEBUG]: SurfaceFreedomLevel.L2_NARRATIVE,
  [FounderSurfaceType.DISCOVERY]: SurfaceFreedomLevel.L2_NARRATIVE,
});

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

export const RiskClass = Object.freeze({
  INFORMATIONAL: 'informational',
  BOUNDED_ACTION: 'bounded_action',
  EXTERNAL_SIDE_EFFECT: 'external_side_effect',
  IRREVERSIBLE: 'irreversible',
});

export const Capability = Object.freeze({
  READ: 'read',
  DELIBERATE: 'deliberate',
  PROPOSE: 'propose',
  SEED: 'seed',
  EXECUTE: 'execute',
  PUBLISH: 'publish',
  ESCALATE: 'escalate',
  ROLLBACK: 'rollback',
});

export const Actor = Object.freeze({
  FOUNDER: 'founder',
  INTERNAL_AGENT: 'internal_agent',
  TOOL_ADAPTER: 'tool_adapter',
});

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const SAFE_FALLBACK_TEXT =
  '[COS] 요청을 처리하는 중 내부 오류가 발생했습니다. 같은 질문을 한 번 더 보내 주세요.';

export const DISCOVERY_PROMPT_TEXT =
  '[COS] 요청을 이해했습니다. 조금 더 구체적으로 말씀해 주시면 최적의 경로로 안내드리겠습니다.';
