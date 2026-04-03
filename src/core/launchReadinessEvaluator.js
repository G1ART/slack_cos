/**
 * Launch readiness — 최소 blocker만. low-stakes 항목으로는 막지 않음.
 */

import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getConversationTranscript } from '../features/slackConversationBuffer.js';

/**
 * @param {{
 *   workContext: object,
 *   threadKey: string,
 *   providerSnapshot: object,
 *   metadata: Record<string, unknown>,
 * }} args
 * @returns {{
 *   readiness: string,
 *   blockers: string[],
 *   defaults_applied: string[],
 *   unresolved_but_non_blocking: string[],
 * }}
 */
export function evaluateLaunchReadiness({ workContext, threadKey, providerSnapshot, metadata }) {
  const intake = getProjectIntakeSession(metadata);
  const transcript = String(getConversationTranscript(threadKey) || '');
  const goal = String(intake?.goalLine || workContext.project_space?.human_label || '').trim();

  const hasSubstantiveScope =
    goal.length >= 5 ||
    transcript.length >= 40 ||
    Boolean(workContext.run) ||
    Boolean(workContext.project_space?.project_id);

  if (!hasSubstantiveScope) {
    return {
      readiness: 'launch_blocked_missing_scope_lock',
      blockers: ['이 스레드에 잠길 목표·맥락이 부족합니다. 킥오프 한 줄 또는 대화 요약이 필요합니다.'],
      defaults_applied: [],
      unresolved_but_non_blocking: [],
    };
  }

  const s = providerSnapshot.summary;
  const executablePaths =
    s.live_count
    + (s.live_ready_count || 0)
    + s.manual_bridge_count
    + s.draft_only_count;
  if (executablePaths === 0) {
    return {
      readiness: 'launch_blocked_missing_provider',
      blockers: ['연결 가능한 실행 경로(live/manual/draft)가 없습니다. 최소 GitHub 토큰 또는 handoff 경로를 확인해 주세요.'],
      defaults_applied: [],
      unresolved_but_non_blocking: [],
    };
  }

  const defaults_applied = [
    '채널: 모바일 반응형 웹 MVP',
    '구현: 직접 개발 + 연결된 toolchain orchestration',
    '프런트: Next.js',
    'DB: Supabase',
    '외부 예약: request-first',
    '알림: 이메일 우선',
    '연동: MVP 제외',
    'manual bridge: 허용',
  ];

  const hasBridge =
    s.manual_bridge_count + s.draft_only_count + (s.live_ready_count || 0) > 0
    || s.unavailable_count > 0;
  const readiness =
    hasBridge || s.not_configured_count > 0
      ? 'launch_ready_with_manual_bridge'
      : 'launch_ready';

  return {
    readiness,
    blockers: [],
    defaults_applied,
    unresolved_but_non_blocking: [],
  };
}
