/**
 * vNext.13.4 — 실행 스파인은 구조화 execution_artifact + 검증 통과 시에만.
 * vNext.13.5 — durable state lineage cross-check (self-claimed boolean 금지).
 * vNext.13.5b — eligibility 는 **턴 이전 persisted lineage** 만 (same-turn sidecar self-auth 불가).
 */

import { runFounderLaunchPipelineCore } from '../core/founderLaunchGate.js';
import { evaluateExecutionSpineEligibility, mergeStateDeltaWithSidecarArtifactIds } from './founderArtifactSchemas.js';

export function isFounderStagingModeEnabled() {
  return process.env.COS_FOUNDER_STAGING_MODE !== '0';
}

/**
 * @param {{
 *   execution_artifact: object,
 *   threadKey: string,
 *   metadata: Record<string, unknown>,
 *   route_label?: string | null,
 *   convStateBeforeTurn: object,
 *   sidecar: object,
 * }} args
 * @returns {Promise<null | Awaited<ReturnType<typeof runFounderLaunchPipelineCore>>>}
 */
export async function tryArtifactGatedExecutionSpine(args) {
  const { execution_artifact, threadKey, metadata, route_label, convStateBeforeTurn, sidecar } = args;
  const ea0 = execution_artifact;
  if (!ea0 || typeof ea0 !== 'object' || ea0.request_execution_spine !== true) return null;

  const mergedDelta = mergeStateDeltaWithSidecarArtifactIds(sidecar.state_delta || {}, sidecar);
  const sidecarResolved = { ...sidecar, state_delta: mergedDelta };
  const eligibility = evaluateExecutionSpineEligibility(ea0, convStateBeforeTurn, sidecarResolved);
  if (!eligibility.ok) {
    return {
      launch_succeeded: false,
      spine_eligibility_failed: true,
      eligibility_reason: eligibility.reason,
    };
  }

  const ea = /** @type {Record<string, unknown>} */ (execution_artifact);
  const out = await runFounderLaunchPipelineCore({
    threadKey,
    metadata,
    route_label,
    goal_line_source: String(ea.goal_line).trim().slice(0, 500),
    locked_scope_summary_source: String(ea.locked_scope_summary || '').trim(),
    trace_tags: { artifact_gated: true, launch_signal: null },
  });
  return {
    ...out,
    launch_succeeded: true,
    trace: {
      ...out.trace,
      founder_staging_mode: isFounderStagingModeEnabled(),
      founder_preflight_boundary: true,
      founder_approval_lineage_verified: true,
      founder_spine_eligibility_source: 'persisted_pre_turn_lineage',
    },
  };
}
