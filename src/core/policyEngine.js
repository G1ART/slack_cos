/**
 * COS Constitution v1.1 — Policy Engine.
 * Stateful policy: f(actor, work_state, risk_class, capability) → PolicyDecision.
 * Replaces the thin founderAuthority.js.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §4
 */

// GREP_COS_CONSTITUTION_POLICY_ENGINE

import {
  WorkPhase,
  FounderSurfaceType,
  RiskClass,
  Actor,
} from './founderContracts.js';

/**
 * Phase → default surface type mapping.
 */
const PHASE_SURFACE_MAP = {
  [WorkPhase.DISCOVER]: FounderSurfaceType.DIALOGUE,
  [WorkPhase.ALIGN]: FounderSurfaceType.DIALOGUE,
  [WorkPhase.LOCK]: FounderSurfaceType.SCOPE_LOCK_PACKET,
  [WorkPhase.SEED]: FounderSurfaceType.EXECUTION_PACKET,
  [WorkPhase.EXECUTE]: FounderSurfaceType.STATUS_REPORT,
  [WorkPhase.REVIEW]: FounderSurfaceType.RUN_STATE,
  [WorkPhase.APPROVE]: FounderSurfaceType.ORCHESTRATION_HANDOFF,
  [WorkPhase.DEPLOY]: FounderSurfaceType.DEPLOY_PACKET,
  [WorkPhase.MONITOR]: FounderSurfaceType.MONITORING,
  [WorkPhase.EXCEPTION]: FounderSurfaceType.EXCEPTION,
  [WorkPhase.UTILITY]: FounderSurfaceType.SAFE_FALLBACK,
};

/**
 * Phase → allowed capabilities.
 */
const PHASE_CAPABILITIES = {
  [WorkPhase.DISCOVER]: ['read', 'deliberate', 'propose'],
  [WorkPhase.ALIGN]: ['read', 'deliberate', 'propose'],
  [WorkPhase.LOCK]: ['read', 'deliberate', 'propose', 'seed'],
  [WorkPhase.SEED]: ['read', 'seed', 'execute'],
  [WorkPhase.EXECUTE]: ['read', 'execute', 'publish'],
  [WorkPhase.REVIEW]: ['read', 'deliberate'],
  [WorkPhase.APPROVE]: ['read', 'propose', 'escalate'],
  [WorkPhase.DEPLOY]: ['read', 'execute', 'publish'],
  [WorkPhase.MONITOR]: ['read'],
  [WorkPhase.EXCEPTION]: ['read', 'escalate', 'rollback'],
  [WorkPhase.UTILITY]: ['read'],
};

/**
 * @param {{
 *   actor?: string,
 *   work_object_type?: string,
 *   work_phase: string,
 *   risk_class?: string,
 *   requested_capability?: string,
 *   intent_signal?: string,
 *   metadata?: Record<string, unknown>,
 * }} ctx
 * @returns {{
 *   allow: boolean,
 *   required_surface_type: string,
 *   allowed_capabilities: string[],
 *   requires_packet: boolean,
 *   requires_approval: boolean,
 *   deny_raw_internal_text: true,
 *   fallback_mode: string|null,
 * }}
 */
export function evaluatePolicy(ctx) {
  const {
    actor = Actor.FOUNDER,
    work_phase,
    risk_class = RiskClass.INFORMATIONAL,
    intent_signal,
  } = ctx;

  const phase = work_phase || WorkPhase.DISCOVER;
  const capabilities = PHASE_CAPABILITIES[phase] || ['read'];

  // Determine surface type — phase-based with intent_signal overrides for utility
  let surfaceType = PHASE_SURFACE_MAP[phase] || FounderSurfaceType.SAFE_FALLBACK;

  // Utility/meta intent signals override phase surface when no active work object
  if (intent_signal) {
    const utilityOverrides = {
      runtime_meta: FounderSurfaceType.RUNTIME_META,
      meta_debug: FounderSurfaceType.META_DEBUG,
      help: FounderSurfaceType.HELP,
      query_lookup: FounderSurfaceType.QUERY,
      structured_command: FounderSurfaceType.STRUCTURED_COMMAND,
      project_status: FounderSurfaceType.EXECUTIVE_STATUS,
      unknown_invalid: FounderSurfaceType.SAFE_FALLBACK,
    };
    if (utilityOverrides[intent_signal] && phase === WorkPhase.DISCOVER) {
      surfaceType = utilityOverrides[intent_signal];
    }
    if (intent_signal === 'runtime_meta' || intent_signal === 'meta_debug' || intent_signal === 'help') {
      surfaceType = utilityOverrides[intent_signal];
    }
  }

  const requiresPacket = [
    WorkPhase.LOCK, WorkPhase.SEED, WorkPhase.EXECUTE,
    WorkPhase.APPROVE, WorkPhase.DEPLOY,
  ].includes(phase);

  const requiresApproval =
    risk_class === RiskClass.EXTERNAL_SIDE_EFFECT ||
    risk_class === RiskClass.IRREVERSIBLE ||
    phase === WorkPhase.APPROVE ||
    phase === WorkPhase.DEPLOY;

  const allow = actor === Actor.FOUNDER || capabilities.includes('read');

  return {
    allow,
    required_surface_type: surfaceType,
    allowed_capabilities: capabilities,
    requires_packet: requiresPacket,
    requires_approval: requiresApproval,
    deny_raw_internal_text: true,
    fallback_mode: allow ? null : 'safe_fallback',
  };
}
