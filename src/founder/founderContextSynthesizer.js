/**
 * vNext.13 — 창업자 면: COS 내부용 맥락 프레임(제안 패킷 입력).
 */

import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import {
  getProjectIntakeSession,
  isActiveProjectIntake,
} from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';

/**
 * @param {{ threadKey?: string, metadata: Record<string, unknown> }} args
 * @returns {object}
 */
export function synthesizeFounderContext({ threadKey: tkIn, metadata }) {
  const threadKey = tkIn || buildSlackThreadKey(metadata);
  const transcript_excerpt = String(getConversationTranscript(threadKey) || '').trim().slice(0, 4000);
  const intake = getProjectIntakeSession(metadata);
  const intake_active = isActiveProjectIntake(metadata);
  const run = getExecutionRunByThread(threadKey);
  const space = getProjectSpaceByThread(threadKey);
  const goal_line_hint =
    (intake?.goalLine && String(intake.goalLine).trim()) ||
    (space?.human_label && String(space.human_label).trim()) ||
    null;

  const spec = intake?.spec && typeof intake.spec === 'object' ? intake.spec : null;
  const success_condition_hint =
    (spec?.success_metrics && String(spec.success_metrics).trim().slice(0, 500)) ||
    (spec?.mvpSuccess && String(spec.mvpSuccess).trim().slice(0, 500)) ||
    (spec?.successMetrics && String(spec.successMetrics).trim().slice(0, 500)) ||
    null;

  const constraints = [];
  if (run?.run_id) constraints.push(`활성 실행 런: ${run.run_id}`);
  if (space?.project_id) constraints.push(`프로젝트 공간: ${space.human_label || space.project_id}`);
  if (intake_active && !run) constraints.push('인테이크 진행 중 — 실행 스파인은 아직 없을 수 있음');

  return {
    thread_key: threadKey,
    transcript_excerpt,
    intake_active,
    goal_line_hint,
    north_star_hint: goal_line_hint,
    success_condition_hint,
    has_run: Boolean(run?.run_id),
    has_space: Boolean(space?.project_id),
    project_label: space?.human_label || null,
    constraints,
  };
}
