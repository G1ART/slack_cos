/**
 * vNext.13 — 창업자 면: COS 내부용 맥락 프레임(제안 패킷 입력).
 * vNext.13.4 — durable conversation state 스냅샷을 주 컨텍스트로 병합 (transcript는 보조).
 * vNext.13.6 — recent_file_contexts (첨부 파일 인테이크 스냅샷).
 */

import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import {
  getProjectIntakeSession,
  isActiveProjectIntake,
} from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';

/**
 * @param {{ threadKey?: string, metadata: Record<string, unknown>, conversationStateSnapshot?: Record<string, unknown> | null }} args
 * @returns {object}
 */
export function synthesizeFounderContext({ threadKey: tkIn, metadata, conversationStateSnapshot = null }) {
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

  const snap = conversationStateSnapshot && typeof conversationStateSnapshot === 'object' ? conversationStateSnapshot : {};
  const ss = snap.state_snapshot && typeof snap.state_snapshot === 'object' ? snap.state_snapshot : {};
  const recent_file_contexts = Array.isArray(snap.recent_file_contexts) ? snap.recent_file_contexts : [];
  if (recent_file_contexts.length > 0) {
    const last = recent_file_contexts[recent_file_contexts.length - 1];
    const fn = last?.filename ? String(last.filename) : '첨부';
    const st = last?.extract_status ? String(last.extract_status) : '';
    constraints.push(`최근 Slack 파일 인테이크: ${fn}${st ? ` (${st})` : ''}`);
  }

  let north_star_hint = goal_line_hint;
  if (ss.north_star && String(ss.north_star).trim()) {
    north_star_hint = String(ss.north_star).trim();
  }

  return {
    thread_key: threadKey,
    transcript_excerpt,
    intake_active,
    goal_line_hint,
    north_star_hint,
    success_condition_hint,
    has_run: Boolean(run?.run_id),
    has_space: Boolean(space?.project_id),
    project_label: space?.human_label || null,
    constraints,
    external_execution_authorization_state: run?.external_execution_authorization?.state ?? null,
    state_snapshot: ss,
    recent_decisions: Array.isArray(snap.recent_decisions) ? snap.recent_decisions : [],
    pending_confirmations: Array.isArray(snap.pending_confirmations) ? snap.pending_confirmations : [],
    scope_lock_status: snap.scope_lock_status || null,
    proposal_history_summary: snap.proposal_history_summary || null,
    execution_boundary_status: snap.execution_boundary_status || null,
    recent_file_contexts,
  };
}
