/**
 * vNext.13.4 — 실행 스파인은 구조화 execution_artifact + 검증 통과 시에만.
 * vNext.13.5 — durable state lineage cross-check (self-claimed boolean 금지).
 */

import { runFounderLaunchPipelineCore } from '../core/founderLaunchGate.js';
import {
  validateExecutionArtifactForSpine,
  buildFounderLineagePreview,
  mergeStateDeltaWithSidecarArtifactIds,
} from './founderArtifactSchemas.js';

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
  const mergedDelta = mergeStateDeltaWithSidecarArtifactIds(sidecar.state_delta || {}, sidecar);
  const sidecarResolved = { ...sidecar, state_delta: mergedDelta };
  const lineagePreview = buildFounderLineagePreview(convStateBeforeTurn, sidecarResolved);
  const v = validateExecutionArtifactForSpine(execution_artifact, lineagePreview);
  if (!v.ok) return null;

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
    trace: {
      ...out.trace,
      founder_staging_mode: isFounderStagingModeEnabled(),
      founder_preflight_boundary: true,
      founder_approval_lineage_verified: true,
    },
  };
}
