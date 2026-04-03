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

  const constraints = [];
  if (run?.run_id) constraints.push(`활성 실행 런: ${run.run_id}`);
  if (space?.project_id) constraints.push(`프로젝트 공간: ${space.human_label || space.project_id}`);
  if (intake_active && !run) constraints.push('인테이크 진행 중 — 실행 스파인은 아직 없을 수 있음');

  return {
    thread_key: threadKey,
    transcript_excerpt,
    intake_active,
    goal_line_hint,
    has_run: Boolean(run?.run_id),
    has_space: Boolean(space?.project_id),
    project_label: space?.human_label || null,
    constraints,
  };
}
