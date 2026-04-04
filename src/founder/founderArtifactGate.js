/**
 * vNext.13.4 — 실행 스파인은 구조화 execution_artifact + 검증 통과 시에만 시작 (founder 원문만으로는 불가).
 */

import { runFounderLaunchPipelineCore } from '../core/founderLaunchGate.js';
import { validateExecutionArtifactForSpine } from './founderArtifactSchemas.js';

/**
 * @param {{ execution_artifact: object, threadKey: string, metadata: Record<string, unknown>, route_label?: string | null }} args
 * @returns {Promise<null | Awaited<ReturnType<typeof runFounderLaunchPipelineCore>>>}
 */
export async function tryArtifactGatedExecutionSpine(args) {
  const { execution_artifact, threadKey, metadata, route_label } = args;
  const v = validateExecutionArtifactForSpine(execution_artifact);
  if (!v.ok) return null;
  const ea = /** @type {Record<string, unknown>} */ (execution_artifact);
  return runFounderLaunchPipelineCore({
    threadKey,
    metadata,
    route_label,
    goal_line_source: String(ea.goal_line).trim().slice(0, 500),
    locked_scope_summary_source: String(ea.locked_scope_summary || '').trim(),
    trace_tags: { artifact_gated: true, launch_signal: null },
  });
}
