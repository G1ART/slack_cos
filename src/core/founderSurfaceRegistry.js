/**
 * COS Constitution v1.1 — Surface registry: work_phase + policy → surface type.
 * Three tiers: Meta/Utility, OS Surfaces, Executive Surfaces.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §5
 */

// GREP_COS_CONSTITUTION_SURFACE_REGISTRY

import { WorkPhase, FounderSurfaceType, FOUNDER_SURFACE_VALUES } from './founderContracts.js';

/**
 * Default phase → surface mapping. Policy engine may override.
 */
const PHASE_SURFACE_MAP = {
  [WorkPhase.DISCOVER]: FounderSurfaceType.DISCOVERY,
  [WorkPhase.ALIGN]: FounderSurfaceType.EXECUTIVE_KICKOFF,
  [WorkPhase.LOCK]: FounderSurfaceType.EXECUTION_PACKET,
  [WorkPhase.SEED]: FounderSurfaceType.EXECUTION_PACKET,
  [WorkPhase.EXECUTE]: FounderSurfaceType.RUN_STATE,
  [WorkPhase.REVIEW]: FounderSurfaceType.RUN_STATE,
  [WorkPhase.APPROVE]: FounderSurfaceType.APPROVAL_PACKET,
  [WorkPhase.DEPLOY]: FounderSurfaceType.DEPLOY_PACKET,
  [WorkPhase.MONITOR]: FounderSurfaceType.MONITORING,
  [WorkPhase.EXCEPTION]: FounderSurfaceType.EXCEPTION,
  [WorkPhase.UTILITY]: FounderSurfaceType.SAFE_FALLBACK,
};

/**
 * Resolve surface type from policy decision (primary) or phase fallback.
 * @param {{ required_surface_type?: string }} policy
 * @param {string} phase
 * @returns {string}
 */
export function resolveSurfaceType(policy, phase) {
  if (policy?.required_surface_type && FOUNDER_SURFACE_VALUES.has(policy.required_surface_type)) {
    return policy.required_surface_type;
  }
  const mapped = PHASE_SURFACE_MAP[phase];
  if (mapped && FOUNDER_SURFACE_VALUES.has(mapped)) return mapped;
  return FounderSurfaceType.SAFE_FALLBACK;
}

/**
 * Check if a string is a valid registered surface type.
 */
export function isRegisteredSurface(surfaceType) {
  return FOUNDER_SURFACE_VALUES.has(surfaceType);
}

/**
 * Get the default surface for a phase.
 */
export function getDefaultSurfaceForPhase(phase) {
  return PHASE_SURFACE_MAP[phase] || FounderSurfaceType.SAFE_FALLBACK;
}
