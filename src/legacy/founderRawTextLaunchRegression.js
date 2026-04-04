/**
 * LEGACY / REGRESSION ONLY — `maybeHandleFounderLaunchGateRawText`.
 * Raw-text launch is sealed out of production. vNext.13.5.
 */

import { runFounderLaunchPipelineCore } from '../core/founderLaunchGate.js';
import { detectFounderLaunchIntentRawText } from './founderLaunchIntentRawText.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';

/**
 * @returns {Promise<null | Awaited<ReturnType<typeof runFounderLaunchPipelineCore>>>}
 */
export async function maybeHandleFounderLaunchGateRawText(normalized, metadata, route_label, threadKey) {
  const probe = detectFounderLaunchIntentRawText(normalized, metadata, threadKey);
  if (!probe.detected) return null;

  const intake = getProjectIntakeSession(metadata);
  const goalSrc = String(intake?.goalLine || normalized).slice(0, 500);
  return runFounderLaunchPipelineCore({
    threadKey,
    metadata,
    route_label,
    goal_line_source: goalSrc,
    locked_scope_summary_source: null,
    trace_tags: { artifact_gated: false, launch_signal: probe.signal, legacy_raw_text_launch: true },
  });
}
