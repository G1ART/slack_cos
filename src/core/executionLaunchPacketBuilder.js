/**
 * Founder-facing execution launch payload (EXECUTION_PACKET renderer용).
 */

import {
  formatProviderTruthFriendlyLines,
} from './providerTruthSnapshot.js';

/**
 * @param {object|null} run
 * @returns {Record<string, unknown>}
 */
export function buildExecutionArtifactsFromRun(run) {
  if (!run?.artifacts) {
    return {
      research_artifact_path: null,
      uiux_artifact_paths: [],
      qa_artifact_paths: [],
      github_issue_url: null,
      github_pr_url: null,
      cursor_run_ref: null,
      cursor_conversation_url: null,
      cursor_handoff_path: null,
      cursor_branch_name: null,
      cursor_launch_contract_version: null,
      supabase_draft_path: null,
      supabase_migration_path: null,
      supabase_live_apply_ref: null,
      supabase_dispatch_target: null,
      supabase_safe_target: null,
      supabase_outbound_phases: [],
    };
  }
  const swe = run.artifacts.fullstack_swe || {};
  const res = run.artifacts.research_benchmark || {};
  const ux = run.artifacts.uiux_design || {};
  const qa = run.artifacts.qa_qc || {};
  return {
    research_artifact_path: res.research_note_path || null,
    uiux_artifact_paths: [ux.ui_spec_delta_path, ux.wireframe_note_path, ux.component_checklist_path].filter(Boolean),
    qa_artifact_paths: [qa.acceptance_checklist_path, qa.regression_case_list_path, qa.smoke_test_plan_path].filter(Boolean),
    github_issue_url: swe.github_issue_url || null,
    github_pr_url: swe.pr_url || null,
    cursor_run_ref: swe.cursor_cloud_run_ref || null,
    cursor_conversation_url: swe.cursor_conversation_url || null,
    cursor_handoff_path: swe.cursor_handoff_path || null,
    cursor_branch_name: swe.cursor_branch_name || null,
    cursor_launch_contract_version: swe.cursor_launch_contract_version || null,
    supabase_draft_path: swe.supabase_schema_draft_path || null,
    supabase_migration_path: swe.supabase_migration_file_path || null,
    supabase_live_apply_ref: swe.supabase_live_apply_ref || null,
    supabase_dispatch_target: swe.supabase_dispatch_target || null,
    supabase_safe_target: swe.supabase_safe_target || null,
    supabase_outbound_phases: Array.isArray(swe.supabase_outbound_phases) ? swe.supabase_outbound_phases : [],
  };
}

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
  const providerFriendlyLines = formatProviderTruthFriendlyLines(providerTruth);

  const workstreamLines = (run.workstreams || []).map(
    (ws) => `${ws.lane_type} (${ws.status || 'pending'})`,
  );

  const artifacts = buildExecutionArtifactsFromRun(run);
  const provider_native_refs = {
    github_issue_url: artifacts.github_issue_url,
    github_pr_url: artifacts.github_pr_url,
    cursor_run_ref: artifacts.cursor_run_ref,
    cursor_conversation_url: artifacts.cursor_conversation_url,
    cursor_branch_name: artifacts.cursor_branch_name,
    cursor_launch_contract_version: artifacts.cursor_launch_contract_version,
    supabase_draft_path: artifacts.supabase_draft_path,
    supabase_migration_path: artifacts.supabase_migration_path,
    supabase_live_apply_ref: artifacts.supabase_live_apply_ref,
    supabase_dispatch_target: artifacts.supabase_dispatch_target,
    supabase_safe_target: artifacts.supabase_safe_target,
    supabase_outbound_phases: artifacts.supabase_outbound_phases,
  };

  const autoStarted = [];
  if (artifacts.research_artifact_path) autoStarted.push(`[자동 시작됨] 연구 노트: \`${artifacts.research_artifact_path}\``);
  if (artifacts.uiux_artifact_paths?.length) {
    autoStarted.push(`[자동 시작됨] UI/UX 스펙·와이어: ${artifacts.uiux_artifact_paths.length}개 파일`);
  }
  if (artifacts.qa_artifact_paths?.length) {
    autoStarted.push(`[자동 시작됨] QA 체크리스트: ${artifacts.qa_artifact_paths.length}개 파일`);
  }
  if (artifacts.github_issue_url) {
    autoStarted.push(`[자동 시작됨] GitHub issue: ${artifacts.github_issue_url}`);
  }
  if (artifacts.github_pr_url) {
    autoStarted.push(`[자동 시작됨] GitHub PR: ${artifacts.github_pr_url}`);
  } else if (run?.artifacts?.fullstack_swe?.github_draft_payload) {
    autoStarted.push('[로컬 드래프트] GitHub 이슈 JSON 드래프트 생성');
  }
  if (artifacts.cursor_run_ref) {
    autoStarted.push(`[자동 시작됨] Cursor run_ref: \`${artifacts.cursor_run_ref}\``);
  }
  if (artifacts.cursor_conversation_url) {
    autoStarted.push(`[자동 시작됨] Cursor conversation: ${artifacts.cursor_conversation_url}`);
  }
  if (artifacts.cursor_branch_name) {
    autoStarted.push(`[자동 시작됨] Cursor branch: \`${artifacts.cursor_branch_name}\``);
  }
  if (artifacts.cursor_handoff_path && !artifacts.cursor_run_ref) {
    autoStarted.push(`[수동 브리지] Cursor 핸드오프: \`${artifacts.cursor_handoff_path}\``);
  }
  if (artifacts.supabase_draft_path) {
    autoStarted.push(`[자동 시작됨] Supabase 스키마 JSON: \`${artifacts.supabase_draft_path}\``);
  }
  if (artifacts.supabase_migration_path) {
    autoStarted.push(`[자동 시작됨] Supabase migration 스텁: \`${artifacts.supabase_migration_path}\``);
  }
  if (artifacts.supabase_live_apply_ref) {
    autoStarted.push(`[자동 시작됨] Supabase dispatch apply_ref: \`${artifacts.supabase_live_apply_ref}\``);
  }
  if (artifacts.supabase_dispatch_target) {
    autoStarted.push(`[참조] Supabase dispatch 호스트: \`${artifacts.supabase_dispatch_target}\` (safe_target=${artifacts.supabase_safe_target || 'unknown'})`);
  }
  if (artifacts.supabase_outbound_phases?.length) {
    autoStarted.push(`[참조] Supabase 단계: ${artifacts.supabase_outbound_phases.join(' → ')}`);
  }

  const immediate_actions = [
    'PRD / IA / 권한표 / 데이터모델 드래프트 생성',
    'GitHub 이슈 시드 및 워크스트림 디스패치',
    'Cursor: `COS_CURSOR_CLOUD_LAUNCH_URL` 있으면 launch_contract v1 POST(응답에 run_ref·conversation_url 권장), 없으면 핸드오프',
    'Supabase: 스키마 JSON → migration 스텁 → `COS_SUPABASE_LIVE_DISPATCH_URL` staged POST(COS_SUPABASE_SAFE_TARGET)',
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
    /** 한 줄씩 `provider: 한글해석 (\`status\`) — note` */
    provider_truth_friendly: providerFriendlyLines,
    provider_truth_structured: providerTruth,
    provider_native_refs,
    immediate_actions,
    manual_bridge_actions: manualBridgeActions,
    defaults_applied: readiness.defaults_applied?.length ? readiness.defaults_applied : LAUNCH_DEFAULT_ASSUMPTIONS,
    readiness_state: readiness.readiness,
    founder_next_action,
    blocker: null,
    next_actions: immediate_actions,
    project_space_resolution_mode: mode || null,
    founder_facing_space_note,
    execution_artifacts: artifacts,
    auto_started_artifacts: autoStarted,
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
