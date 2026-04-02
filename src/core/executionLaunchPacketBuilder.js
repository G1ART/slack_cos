/**
 * Founder-facing execution launch payload (EXECUTION_PACKET renderer용).
 */

export const LAUNCH_DEFAULT_ASSUMPTIONS = [
  '채널: 모바일 반응형 웹 MVP',
  '구현: 직접 개발 + 연결된 toolchain orchestration',
  '프런트: Next.js',
  'DB: Supabase',
  '외부 예약: request-first',
  '알림: 이메일 우선',
  '연동: MVP 제외',
  'manual bridge: 허용',
];

/**
 * @param {{
 *   run: object,
 *   space: object | null,
 *   providerTruth: ReturnType<import('./providerTruthSnapshot.js').buildProviderTruthSnapshot>,
 *   readiness: ReturnType<import('./launchReadinessEvaluator.js').evaluateLaunchReadiness>,
 *   manualBridgeActions: string[],
 *   projectSpaceResolution?: object | null,
 * }} args
 */
export function buildExecutionLaunchRenderPayload({
  run,
  space,
  providerTruth,
  readiness,
  manualBridgeActions,
  projectSpaceResolution = null,
}) {
  const providerLines = (providerTruth.providers || []).map(
    (p) => `${p.provider}: ${p.status}${p.note ? ` — ${p.note}` : ''}`,
  );

  const workstreamLines = (run.workstreams || []).map(
    (ws) => `${ws.lane_type} (${ws.status || 'pending'})`,
  );

  const immediate_actions = [
    'PRD / IA / 권한표 / 데이터모델 드래프트 생성',
    'GitHub 이슈 시드 및 워크스트림 디스패치',
    'Cursor 핸드오프(`data/exec-handoffs/`) 갱신',
  ];

  const founder_next_action =
    manualBridgeActions.length > 0
      ? '수동 브리지 항목을 한 번 확인한 뒤, 크리티컬 결정만 스레드에 남겨 주세요.'
      : '워크스트림 로그를 확인하고, 필요 시 우선순위만 조정해 주세요.';

  const mode = projectSpaceResolution?.project_space_resolution_mode;
  let founder_facing_space_note = null;
  if (
    mode === 'new_bootstrap' &&
    Array.isArray(projectSpaceResolution?.possible_related_spaces) &&
    projectSpaceResolution.possible_related_spaces.length > 0
  ) {
    founder_facing_space_note =
      '유사한 이름의 기존 프로젝트가 있어 오탐·작업 섞임을 막기 위해 **이 스레드 전용 새 project space**로 개시했습니다.';
  }

  return {
    goal_line: run.project_goal,
    locked_scope_summary: run.locked_mvp_summary,
    packet_id: run.packet_id,
    run_id: run.run_id,
    project_space: space
      ? { id: space.project_id, label: space.human_label }
      : { id: run.project_id, label: run.project_label },
    run_summary: { run_id: run.run_id, stage: run.current_stage, status: run.status },
    workstreams: workstreamLines,
    /** 한 줄씩 `provider: status — note` (renderer *provider truth* 섹션과 동일 순서) */
    provider_truth: providerLines,
    provider_truth_structured: providerTruth,
    immediate_actions,
    manual_bridge_actions: manualBridgeActions,
    defaults_applied: readiness.defaults_applied?.length ? readiness.defaults_applied : LAUNCH_DEFAULT_ASSUMPTIONS,
    readiness_state: readiness.readiness,
    founder_next_action,
    blocker: null,
    next_actions: immediate_actions,
    project_space_resolution_mode: mode || null,
    founder_facing_space_note,
  };
}

/**
 * @param {{ blockers: string[], readiness: string, founder_next_action?: string }} args
 */
export function buildLaunchBlockedPayload({ blockers, readiness, founder_next_action }) {
  return {
    blockers,
    readiness,
    founder_next_action:
      founder_next_action || '목표를 한 줄로 보내 주시면 실행 패킷으로 바로 전환합니다.',
  };
}
