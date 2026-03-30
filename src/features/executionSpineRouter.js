/**
 * Execution Spine Router — post-lock 스레드에서 대표 표면 소유.
 * Council/matrix/operator 가 final speaker 되지 못하도록 막고,
 * 실행 단계별 전용 renderer만 허용.
 */

import { buildSlackThreadKey } from './slackConversationBuffer.js';
import {
  getProjectIntakeSession,
  hasOpenExecutionOwnership,
  transitionProjectIntakeStage,
  buildProjectIntakeCouncilDeferSurface,
} from './projectIntakeSession.js';
import {
  getExecutionRunByThread,
  updateRunStage,
  updateRunReport,
  updateRunDeployStatus,
} from './executionRun.js';
import { collectOutboundStatus, formatOutboundStatusForSlack, retryRunOutbound } from './executionOutboundOrchestrator.js';
import {
  evaluateExecutionRunCompletion,
  detectAndApplyCompletion,
  evaluateDeployReadiness,
  buildUnifiedDeployPacket,
  detectPMIntent,
  diagnoseGithubConfig,
  getCursorOperationalStatus,
  buildSupabaseManualApplyInstructions,
  computeLaneDispatchPlan,
  scanPendingCursorResults,
} from './executionDispatchLifecycle.js';

/* ------------------------------------------------------------------ */
/*  GitHub execution truth — honest status model                       */
/* ------------------------------------------------------------------ */

/**
 * Derive honest GitHub execution truth from run state.
 * Distinguishes live API results from planned/artifact-only states.
 */
export function deriveGithubExecutionTruth(run) {
  const git = run?.git_trace || {};
  const artifacts = run?.artifacts?.fullstack_swe || {};
  const ghDiag = diagnoseGithubConfig();

  const repoStatus = git.repo ? 'linked' : ghDiag.configured ? 'configured_no_repo' : 'not_configured';
  const issueStatus = git.issue_id ? 'issue_created_live' : artifacts.github_issue_id ? 'issue_created_live' : 'none';
  const branchStatus = git.branch
    ? (git.pr_id ? 'branch_created_live' : 'branch_seeded')
    : artifacts.branch_name ? 'branch_planned' : 'none';
  const prStatus = git.pr_id ? 'pr_created_live' : artifacts.pr_id ? 'pr_created_live' : artifacts.pr_url ? 'pr_created_live' : 'none';

  return {
    repo_bootstrap_status: repoStatus,
    issue_status: issueStatus,
    issue_id: git.issue_id || artifacts.github_issue_id || null,
    issue_url: artifacts.github_issue_url || null,
    branch_status: branchStatus,
    branch_name: git.branch || artifacts.branch_name || null,
    pr_status: prStatus,
    pr_id: git.pr_id || artifacts.pr_id || null,
    pr_url: artifacts.pr_url || null,
    commit_shas: git.commit_shas || [],
    github_configured: ghDiag.configured,
    github_mode: ghDiag.mode,
  };
}

/* ------------------------------------------------------------------ */
/*  Execution-phase renderers                                          */
/* ------------------------------------------------------------------ */

export function renderExecutionRunningPacket(run) {
  const laneLines = (run.workstreams || []).map((w) => {
    const ob = w.outbound || {};
    const statusIcon = {
      pending: '⏳', drafted: '📋', dispatched: '🚀',
      completed: '✅', manual_required: '👤', blocked: '🚫', failed: '❌',
    }[ob.outbound_status] || '⏳';
    const provider = ob.outbound_provider ? ` (${ob.outbound_provider})` : '';
    const refs = (ob.outbound_ref_ids || []).length
      ? ` → ${ob.outbound_ref_ids.slice(0, 2).join(', ')}`
      : '';
    return `${statusIcon} \`${w.lane_type}\`${provider}: ${ob.outbound_status || w.status}${refs}`;
  });

  const git = run.git_trace || {};
  const gitParts = [];
  if (git.repo) gitParts.push(`repo: \`${git.repo}\``);
  if (git.issue_id) gitParts.push(`issue: \`#${git.issue_id}\``);
  if (git.branch) gitParts.push(`branch: \`${git.branch}\``);
  if (git.generated_cursor_handoff_path) gitParts.push(`cursor handoff: \`${git.generated_cursor_handoff_path}\``);

  const projectLabel = run.project_id ? ` · project \`${run.project_id}\`` : '';

  const lines = [
    `*[실행 개시 · 내부 오케스트레이션]*`,
    `\`${run.run_id}\` · packet \`${run.packet_id}\`${projectLabel}`,
    '',
    `*목표:* ${String(run.project_goal || '').slice(0, 300)}`,
    '',
    '*Lane 배정 및 outbound 현황*',
    ...(laneLines.length ? laneLines : ['- (없음)']),
  ];

  if (gitParts.length) {
    lines.push('', '*Outbound trace*', ...gitParts.map((p) => `- ${p}`));
  } else {
    lines.push('', '*Git trace*', '- 생성 예정');
  }

  lines.push(
    '',
    '*다음 보고:* 초안 산출물 묶음 준비 시',
    '',
    '_대표 표면은 결과·에스컬레이션 위주로 유지합니다._',
  );

  return lines.join('\n');
}

export function renderExecutionReportingPacket(run) {
  const report = run.latest_report || null;

  const statusMap = {
    pending: '⏳', drafted: '📋', dispatched: '🚀',
    completed: '✅', manual_required: '👤', blocked: '🚫', failed: '❌',
    acknowledged: '📬', partial: '🔄', in_progress: '🔄', not_started: '⏳',
    running: '🔄', manual_blocked: '👤',
  };

  const eval_ = evaluateExecutionRunCompletion(run.run_id);
  const overallStatus = eval_?.overall_status || 'unknown';
  const dispatchState = run.outbound_dispatch_state || 'not_started';
  const dispatchIcon = statusMap[dispatchState] || '❓';
  const overallIcon = statusMap[overallStatus] || '❓';

  const lanePlan = computeLaneDispatchPlan(run);

  const laneLines = (run.workstreams || []).map((w) => {
    const ob = w.outbound || {};
    const icon = statusMap[ob.outbound_status] || '⏳';
    const provider = ob.outbound_provider ? ` (${ob.outbound_provider})` : '';
    const refs = (ob.outbound_ref_ids || []).length
      ? `\n  → ${ob.outbound_ref_ids.slice(0, 3).join(', ')}`
      : '';
    const errLine = ob.last_error ? `\n  _err: ${String(ob.last_error).slice(0, 100)}_` : '';
    const planEntry = lanePlan.find((p) => p.lane_type === w.lane_type);
    const depInfo = planEntry?.depends_on?.length
      ? `\n  deps: ${planEntry.depends_on.join(', ')} ${planEntry.deps_resolved ? '✅' : '⏳ 대기'}`
      : '';
    return `${icon} \`${w.lane_type}\`: ${ob.outbound_status || w.status}${provider}${refs}${errLine}${depInfo}`;
  });

  const projectLabel = run.project_id ? ` · project \`${run.project_id}\`` : '';

  const lines = [
    `*[PM 진행 보고]*`,
    `\`${run.run_id}\` · packet \`${run.packet_id}\`${projectLabel}`,
    run.originating_task_kind ? `task: \`${run.originating_task_kind}\`` : '',
    '',
    `${overallIcon} *전체:* \`${overallStatus}\` · *단계:* \`${run.current_stage}\``,
    `*Dispatch:* ${dispatchIcon} \`${dispatchState}\`${run.outbound_dispatched_at ? ` (${run.outbound_dispatched_at})` : ''}`,
    '',
    '*Lane 상태*',
    ...(laneLines.length ? laneLines : ['- (없음)']),
  ];

  const ghDiag = diagnoseGithubConfig();
  const cursorSt = getCursorOperationalStatus(run.run_id);
  const supaSt = buildSupabaseManualApplyInstructions(run.run_id);

  lines.push('', '*Provider 준비 상태 (readiness)*');
  lines.push(`- GitHub: ${ghDiag.configured ? '✅ live' : `⚠️ draft_only (미설정: ${ghDiag.missing.join(', ')})`}`);
  lines.push(`- Cursor: ${cursorSt ? `${statusMap[cursorSt.status] || '❓'} ${cursorSt.status}` : '❓ unknown'}`);
  const supaLane = (run.workstreams || []).find((w) => w.outbound?.outbound_provider === 'supabase');
  const supaStatus = supaLane?.outbound?.outbound_status || 'pending';
  lines.push(`- Supabase: ${statusMap[supaStatus] || '⏳'} ${supaStatus}${supaSt?.draft_path !== '(no draft created)' ? ' (draft 있음)' : ''}`);

  const runTruth = buildProviderRunTruth(run);
  if (runTruth.length) {
    lines.push('', '*Provider 실행 상태 (run truth)*');
    lines.push(...runTruth);
  }
  if (cursorSt?.status === 'result_ingested' && cursorSt.result_summary) {
    lines.push(`  결과: ${cursorSt.result_summary.slice(0, 120)}`);
  }

  const gitTrace = run.git_trace || {};
  const gitParts = [];
  if (gitTrace.repo) gitParts.push(`repo: \`${gitTrace.repo}\``);
  if (gitTrace.issue_id) gitParts.push(`issue: \`#${gitTrace.issue_id}\``);
  if (gitTrace.branch) gitParts.push(`branch: \`${gitTrace.branch}\``);
  if (gitTrace.pr_id) gitParts.push(`PR: \`#${gitTrace.pr_id}\``);
  if (gitTrace.generated_cursor_handoff_path) gitParts.push(`cursor handoff: \`${gitTrace.generated_cursor_handoff_path}\``);
  if ((gitTrace.supabase_migration_ids || []).length) gitParts.push(`supabase migrations: \`${gitTrace.supabase_migration_ids.join(', ')}\``);
  if (gitParts.length) {
    lines.push('', '*Outbound trace*', ...gitParts.map((p) => `- ${p}`));
  }

  const cursorTraceLen = (run.cursor_trace || []).length;
  const supaTraceLen = (run.supabase_trace || []).length;
  if (cursorTraceLen) {
    const last = run.cursor_trace[cursorTraceLen - 1];
    const ct = [`entries: ${cursorTraceLen}`];
    if (last.status) ct.push(`latest: \`${last.status}\``);
    if (last.changed_files?.length) ct.push(`changed: ${last.changed_files.length}개`);
    if (last.tests_passed != null) ct.push(`tests: ${last.tests_passed ? 'pass' : 'fail'}`);
    if (last.result_summary) ct.push(last.result_summary.slice(0, 120));
    lines.push('', '*Cursor trace*', ct.join(' · '));
  }
  if (supaTraceLen) {
    const last = run.supabase_trace[supaTraceLen - 1];
    const st = [`entries: ${supaTraceLen}`];
    if (last.status) st.push(`latest: \`${last.status}\``);
    if (last.migration_id) st.push(`migration: \`${last.migration_id}\``);
    lines.push('', '*Supabase trace*', st.join(' · '));
  }

  const blocked = (run.workstreams || []).filter((w) => ['manual_required', 'blocked', 'failed'].includes(w.outbound?.outbound_status));
  if (blocked.length) {
    lines.push('', '*수동 조치 필요*');
    for (const b of blocked) {
      lines.push(`- \`${b.lane_type}\`: ${b.outbound?.outbound_status} — ${b.outbound?.last_error || '(세부 없음)'}`);
    }
  }

  // Deploy readiness section
  const deployEval = evaluateDeployReadiness(run.run_id);
  if (deployEval) {
    lines.push('', `*배포 준비*: ${deployEval.deploy_readiness} (${run.deploy_status || 'none'})`);
    if (deployEval.env_missing?.length) {
      lines.push(`  필요 환경변수: ${deployEval.env_missing.join(', ')}`);
    }
  }

  if (eval_?.next_actions?.length) {
    lines.push('', '*다음 필요 액션*');
    for (const a of eval_.next_actions) lines.push(`- ${a}`);
  }

  // Founder next action
  const founderAction = deriveFounderNextAction(run, eval_, deployEval);
  if (founderAction) {
    lines.push('', `*대표 다음 조치*: ${founderAction}`);
  }

  const retryable = (eval_?.failed_lanes?.length || 0) > 0;
  if (retryable) lines.push('', '_"다시 시도해" 로 실패 lane 재실행 가능_');

  if (report) {
    lines.push('', '*최신 보고*', String(report).slice(0, 600));
  }

  return lines.filter(Boolean).join('\n');
}

function deriveFounderNextAction(run, eval_, deployEval) {
  if (!eval_) return null;
  if (run.current_stage === 'deploy_ready') return '배포 승인 또는 추가 수정 요청';
  if (run.current_stage === 'completed') return '완료됨 — 추가 작업 없음';
  if (eval_.overall_status === 'manual_blocked') return `수동 조치 필요: ${eval_.manual_required_lanes.join(', ')}`;
  if (eval_.overall_status === 'failed') return `실패 lane 재시도: "${eval_.failed_lanes.join(', ')}" 또는 원인 확인`;
  if (eval_.overall_status === 'completed' && deployEval?.deploy_readiness === 'ready') return '배포 승인 대기 중';
  if (eval_.overall_status === 'running') return '실행 진행 중 — 대기';
  return null;
}

function renderRetryResponsePacket(run, eval_) {
  const lines = [
    `*[재시도 실행]*`,
    `\`${run.run_id}\``,
    '',
  ];
  if (eval_) {
    lines.push(`*전체 상태:* \`${eval_.overall_status}\``);
    if (eval_.failed_lanes.length) lines.push(`*재시도 대상:* ${eval_.failed_lanes.map((l) => `\`${l}\``).join(', ')}`);
    if (eval_.completed_lanes.length) lines.push(`*완료:* ${eval_.completed_lanes.map((l) => `\`${l}\``).join(', ')}`);
    if (eval_.next_actions.length) {
      lines.push('', '*다음 액션*');
      for (const a of eval_.next_actions) lines.push(`- ${a}`);
    }
  } else {
    lines.push('재시도를 시작했습니다.');
  }
  return lines.join('\n');
}

function renderManualActionsPacket(run) {
  const eval_ = evaluateExecutionRunCompletion(run.run_id);
  const lines = [
    `*[수동 조치 현황]*`,
    `\`${run.run_id}\``,
    '',
  ];

  if (!eval_ || eval_.manual_required_lanes.length === 0) {
    lines.push('현재 수동 조치가 필요한 lane이 없습니다.');
    return lines.join('\n');
  }

  for (const laneType of eval_.manual_required_lanes) {
    const ws = (run.workstreams || []).find((w) => w.lane_type === laneType);
    lines.push(`- \`${laneType}\` (${ws?.outbound?.outbound_provider || '?'}): ${ws?.outbound?.last_error || '수동 처리 필요'}`);
  }

  const ghDiag = diagnoseGithubConfig();
  if (!ghDiag.configured) {
    lines.push('', `*GitHub 설정 부족:* ${ghDiag.missing.join(', ')}`);
  }

  const cursor = getCursorOperationalStatus(run.run_id);
  if (cursor?.status === 'awaiting_result') {
    lines.push('', `*Cursor:* 핸드오프 생성됨, 결과 대기 중`);
    lines.push(`  결과 드롭 위치: \`${cursor.result_drop_paths[0]}\``);
  }

  const supa = buildSupabaseManualApplyInstructions(run.run_id);
  if (supa && supa.draft_path !== '(no draft created)') {
    lines.push('', '*Supabase:* 수동 적용 대기');
    for (const step of supa.steps) lines.push(`  ${step}`);
  }

  return lines.join('\n');
}

/**
 * PM Cockpit — full operational dashboard.
 * Unified run status + provider truth + deploy readiness + blockers + next founder action.
 * @param {object} run
 * @param {{ mode?: 'oneline'|'detailed', deployInfo?: object }} opts
 */
export function renderPMCockpitPacket(run, opts = {}) {
  if (opts.mode === 'oneline') return renderOneLineStatus(run);

  const eval_ = evaluateExecutionRunCompletion(run.run_id);
  const wsCount = (run.workstreams || []).length;
  const completedCount = eval_?.completed_lanes?.length || 0;
  const gitTrace = run.git_trace || {};

  const lines = [
    `*[PM Cockpit — 전체 상태 보고]*`,
    `\`${run.run_id}\``,
    run.project_id ? `*프로젝트:* \`${run.project_id}\` · ${run.project_label || ''}` : '',
    `*목표:* ${String(run.project_goal || '').slice(0, 200)}`,
    `*전체 상태:* \`${eval_?.overall_status || run.current_stage || 'unknown'}\``,
    `*Lane 진행:* ${completedCount}/${wsCount}`,
    '',
  ];

  // GitHub run truth (honest status model)
  const ghTruth = deriveGithubExecutionTruth(run);
  const ghSummaryParts = [];
  if (ghTruth.issue_status !== 'none') ghSummaryParts.push(`issue: ${ghTruth.issue_status}${ghTruth.issue_id ? ` #${ghTruth.issue_id}` : ''}`);
  if (ghTruth.branch_status !== 'none') ghSummaryParts.push(`branch: ${ghTruth.branch_status}${ghTruth.branch_name ? ` (${ghTruth.branch_name})` : ''}`);
  if (ghTruth.pr_status !== 'none') ghSummaryParts.push(`PR: ${ghTruth.pr_status}${ghTruth.pr_id ? ` #${ghTruth.pr_id}` : ''}`);
  lines.push(`*GitHub*: repo=${ghTruth.repo_bootstrap_status}`);
  if (ghSummaryParts.length) lines.push(`  ${ghSummaryParts.join(' · ')}`);

  // Cursor truth
  const cursorSt = getCursorOperationalStatus(run.run_id);
  lines.push(`*Cursor*: ${cursorSt?.status || 'no_data'}`);

  // Supabase truth
  const supaTraceLen = (run.supabase_trace || []).length;
  const lastSupa = supaTraceLen ? run.supabase_trace[supaTraceLen - 1] : null;
  lines.push(`*Supabase*: ${lastSupa?.status || 'none'}${lastSupa?.migration_id ? ` · migration: ${lastSupa.migration_id}` : ''}`);

  // Deploy truth
  const deployInfo = opts.deployInfo || {};
  const deployReady = deployInfo.deploy_readiness || run.deploy_readiness || 'unknown';
  lines.push(`*배포 준비*: ${deployReady}`);

  // Blockers
  const blockers = [];
  if (eval_?.blocking_lanes?.length) {
    for (const laneType of eval_.blocking_lanes) {
      const ws = (run.workstreams || []).find(w => w.lane_type === laneType);
      blockers.push(`${laneType}: ${ws?.outbound?.last_error || 'blocked'}`);
    }
  }
  if (eval_?.failed_lanes?.length) {
    for (const laneType of eval_.failed_lanes) blockers.push(`${laneType}: failed`);
  }
  if (blockers.length) {
    lines.push('', `*차단 사항 (${blockers.length})*`);
    for (const b of blockers) lines.push(`- ${b}`);
  }

  // Next required founder action
  let founderAction = '없음 — COS가 자동으로 진행합니다.';
  if (eval_?.overall_status === 'manual_blocked') {
    founderAction = `수동 조치 필요: ${eval_.manual_required_lanes.join(', ')}`;
  } else if (run.current_stage === 'deploy_ready') {
    founderAction = '배포 승인 결정이 필요합니다.';
  } else if (eval_?.overall_status === 'completed') {
    founderAction = '실행 완료 — 배포 또는 종료 결정이 필요합니다.';
  }
  lines.push('', `*대표 필요 액션:* ${founderAction}`);

  const retryable = (eval_?.failed_lanes?.length || 0) > 0;
  if (retryable) lines.push('_"다시 시도해" 로 실패 lane 재실행 가능_');

  return lines.filter(Boolean).join('\n');
}

export function renderEscalationPacket(run, escalationText) {
  return [
    `*[에스컬레이션 · 대표 확인 필요]*`,
    `\`${run.run_id}\``,
    '',
    String(escalationText || '대표의 결정이 필요한 사안이 발생했습니다.').slice(0, 1000),
    '',
    '_회신해 주시면 실행을 이어갑니다._',
  ].join('\n');
}

export function renderExecutionCompletedPacket(run) {
  return [
    `*[실행 완료]*`,
    `\`${run.run_id}\``,
    '',
    `*목표:* ${String(run.project_goal || '').slice(0, 300)}`,
    '',
    '*산출물 요약*',
    String(run.latest_report || '(산출물 보고 참조)').slice(0, 1200),
    '',
    '_이 스레드의 실행 스파인이 닫혔습니다. Council·매트릭스를 다시 쓸 수 있습니다._',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Provider run-level truth helper                                    */
/* ------------------------------------------------------------------ */

function buildProviderRunTruth(run) {
  const lines = [];
  const git = run.git_trace || {};
  const ghParts = [];
  if (git.issue_id) ghParts.push(`issue #${git.issue_id}`);
  if (git.branch) ghParts.push(`branch: ${git.branch}`);
  if (git.pr_id) ghParts.push(`PR #${git.pr_id}`);
  if (ghParts.length) {
    lines.push(`- GitHub run: ${ghParts.join(' · ')}`);
  } else {
    lines.push('- GitHub run: none');
  }

  const cursorTrace = (run.cursor_trace || []);
  const lastCursor = cursorTrace.at(-1);
  if (lastCursor) {
    const cursorRunStatus = lastCursor.dispatch_mode || lastCursor.status || 'unknown';
    const files = lastCursor.changed_files?.length ? `${lastCursor.changed_files.length}개 변경` : '';
    lines.push(`- Cursor run: ${cursorRunStatus}${files ? ` (${files})` : ''}`);
  } else {
    lines.push('- Cursor run: none');
  }

  const supaTrace = (run.supabase_trace || []);
  const lastSupa = supaTrace.at(-1);
  if (lastSupa) {
    const supaRunStatus = lastSupa.status || 'unknown';
    const migId = lastSupa.migration_id ? ` · migration: ${lastSupa.migration_id}` : '';
    lines.push(`- Supabase run: ${supaRunStatus}${migId}`);
  } else {
    const supaLane = (run.workstreams || []).find((w) => w.outbound?.outbound_provider === 'supabase');
    const draftStatus = supaLane?.outbound?.outbound_status;
    lines.push(`- Supabase run: ${draftStatus || 'none'}`);
  }

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Deploy packet                                                      */
/* ------------------------------------------------------------------ */

export function renderDeployPacket(run, deployInfo = {}) {
  const providers = [];
  const vercel = deployInfo.vercel || {};
  const railway = deployInfo.railway || {};

  if (vercel.configured || vercel.manual_required) {
    providers.push(`- Vercel: ${vercel.configured ? 'configured' : 'manual_required'}${vercel.project_id ? ` · project: ${vercel.project_id}` : ''}`);
  }
  if (railway.configured || railway.manual_required) {
    providers.push(`- Railway: ${railway.configured ? 'configured' : 'manual_required'}${railway.service_id ? ` · service: ${railway.service_id}` : ''}`);
  }

  const blocked = [];
  if (deployInfo.env_missing?.length) {
    blocked.push(`필요 환경변수: ${deployInfo.env_missing.join(', ')}`);
  }
  if (deployInfo.manual_steps?.length) {
    blocked.push(...deployInfo.manual_steps.map(s => `- ${s}`));
  }

  const deployStatus = run.deploy_status || 'none';

  return [
    `*[배포 패킷]*`,
    `\`${run.run_id}\``,
    '',
    '*배포 대상 Provider*',
    providers.length ? providers.join('\n') : '- 설정된 배포 대상 없음',
    '',
    `*배포 상태*: \`${deployStatus}\``,
    `*배포 준비*: ${deployInfo.deploy_readiness || 'not_ready'}`,
    blocked.length ? `\n*차단 사항*\n${blocked.join('\n')}` : '',
    '',
    deployInfo.next_action || '_배포 준비가 완료되면 대표 승인 후 진행합니다._',
    '',
    `_배포 완료 후: "배포 완료" 또는 deploy URL을 알려주세요._`,
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */
/*  Normalized approval packet                                         */
/* ------------------------------------------------------------------ */

export function renderApprovalPacket(run, packetData = {}) {
  const whatDone = packetData.completed_work || [];
  const whatBlocked = packetData.blockers || [];
  const decision = packetData.decision_needed || '다음 단계 승인';
  const options = packetData.options || [];
  const recommendation = packetData.recommendation || '';

  return [
    `*[대표 승인 요청]*`,
    `\`${run.run_id}\``,
    run.project_goal ? `*목표:* ${String(run.project_goal).slice(0, 200)}` : '',
    '',
    whatDone.length ? `*완료된 작업*\n${whatDone.map(w => `- ${w}`).join('\n')}` : '',
    whatBlocked.length ? `\n*차단 사항*\n${whatBlocked.map(b => `- ${b}`).join('\n')}` : '',
    '',
    `*결정 필요:* ${decision}`,
    options.length ? `\n*선택지*\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : '',
    recommendation ? `\n*COS 권장:* ${recommendation}` : '',
    '',
    '_회신해 주시면 다음 단계를 진행합니다._',
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */
/*  One-line status mode for PM cockpit                                */
/* ------------------------------------------------------------------ */

export function renderOneLineStatus(run) {
  const stage = run.current_stage || 'unknown';
  const goal = String(run.project_goal || '').slice(0, 60);
  const wsCount = (run.workstreams || []).length;
  const completedCount = (run.workstreams || []).filter(w => w.outbound?.outbound_status === 'completed').length;

  return `\`${run.run_id}\` ${goal} — ${stage} (${completedCount}/${wsCount} lanes)`;
}

/* ------------------------------------------------------------------ */
/*  Progress / escalation intent detection                             */
/* ------------------------------------------------------------------ */

const ESCALATION_RE = /에스컬레이션|내\s*승인\s*없이는|대표\s*결정|escalat/i;
const COMPLETION_RE = /실행\s*완료|프로젝트\s*완료|종료/i;

const APPROVAL_APPROVE_RE = /배포\s*승인|deploy\s*approv|승인\s*진행|배포\s*진행/i;
const APPROVAL_REWORK_RE = /추가\s*수정|수정\s*요청|rework|다시\s*수정|수정\s*후/i;
const APPROVAL_HOLD_RE = /보류|hold|나중에|미루|일단\s*멈춰/i;

/**
 * Detect founder approval intent from text.
 * Only meaningful when run.current_stage === 'deploy_ready'.
 * @returns {'approve' | 'rework' | 'hold' | null}
 */
export function detectApprovalIntent(text) {
  const t = String(text || '').trim();
  if (APPROVAL_APPROVE_RE.test(t)) return 'approve';
  if (APPROVAL_REWORK_RE.test(t)) return 'rework';
  if (APPROVAL_HOLD_RE.test(t)) return 'hold';
  return null;
}

/**
 * Apply founder approval decision to run state.
 * @returns {{ ok: boolean, response_text: string, new_stage: string, new_deploy_status: string }}
 */
export function applyApprovalDecision(run, decision, founderNote = '') {
  if (!run) return { ok: false, response_text: '[COS] 실행 정보가 없습니다.', new_stage: '', new_deploy_status: '' };

  const note = String(founderNote || '').trim();
  const ts = new Date().toISOString();

  if (decision === 'approve') {
    updateRunStage(run.run_id, 'approved_for_deploy');
    updateRunDeployStatus(run.run_id, { deploy_status: 'approved' });
    updateRunReport(run.run_id, `[${ts}] 대표 배포 승인. ${note}`);
    const deployPacket = buildUnifiedDeployPacket(run.run_id);
    return {
      ok: true,
      new_stage: 'approved_for_deploy',
      new_deploy_status: 'approved',
      response_text: [
        `*[배포 승인 확인]*`,
        `\`${run.run_id}\` — 배포가 승인되었습니다.`,
        '',
        deployPacket?.manual_steps?.length
          ? `*수동 배포 단계*\n${deployPacket.manual_steps.map(s => `- ${s}`).join('\n')}\n\n배포 완료 후 "배포 완료" 또는 deploy URL을 알려주세요.`
          : '배포를 진행합니다.',
        note ? `\n_대표 메모: ${note}_` : '',
      ].filter(Boolean).join('\n'),
    };
  }

  if (decision === 'rework') {
    updateRunStage(run.run_id, 'in_progress_rework');
    updateRunDeployStatus(run.run_id, { deploy_status: 'rework_requested' });
    updateRunReport(run.run_id, `[${ts}] 대표 수정 요청. ${note}`);
    return {
      ok: true,
      new_stage: 'in_progress_rework',
      new_deploy_status: 'rework_requested',
      response_text: [
        `*[수정 요청 확인]*`,
        `\`${run.run_id}\` — 추가 수정이 요청되었습니다.`,
        note ? `\n*수정 사항:* ${note}` : '\n수정할 내용을 알려주시면 COS가 이어서 진행합니다.',
        '\n수정 완료 후 COS가 다시 배포 승인을 요청합니다.',
      ].filter(Boolean).join('\n'),
    };
  }

  if (decision === 'hold') {
    updateRunStage(run.run_id, 'paused_for_founder');
    updateRunDeployStatus(run.run_id, { deploy_status: 'paused' });
    updateRunReport(run.run_id, `[${ts}] 대표 보류 결정. ${note}`);
    return {
      ok: true,
      new_stage: 'paused_for_founder',
      new_deploy_status: 'paused',
      response_text: [
        `*[보류 확인]*`,
        `\`${run.run_id}\` — 배포가 보류되었습니다.`,
        note ? `\n_사유: ${note}_` : '',
        '\n재개하려면 "배포 승인" 또는 "추가 수정 요청"을 말씀해 주세요.',
      ].filter(Boolean).join('\n'),
    };
  }

  return { ok: false, response_text: '[COS] 인식할 수 없는 승인 응답입니다.', new_stage: '', new_deploy_status: '' };
}

/* ------------------------------------------------------------------ */
/*  Main execution spine handler                                       */
/* ------------------------------------------------------------------ */

/**
 * If this thread has open execution ownership, handle the turn.
 * Returns null if no execution ownership → let other routers proceed.
 * @param {{ trimmed: string, metadata: Record<string, unknown> }} ctx
 * @returns {{ text: string, response_type: string, packet_id?: string, run_id?: string } | 'council_defer' | null}
 */
export function tryFinalizeExecutionSpineTurn({ trimmed, metadata }) {
  if (!trimmed || !metadata) return null;
  if (!hasOpenExecutionOwnership(metadata)) return null;

  const threadKey = buildSlackThreadKey(metadata);
  const run = getExecutionRunByThread(threadKey);
  const sess = getProjectIntakeSession(metadata);

  if (!run && sess) {
    return {
      text: buildProjectIntakeCouncilDeferSurface(metadata),
      response_type: 'execution_spine_defer',
    };
  }

  if (!run) return null;

  scanPendingCursorResults().catch(() => {});

  if (COMPLETION_RE.test(trimmed)) {
    updateRunStage(run.run_id, 'completed');
    transitionProjectIntakeStage(metadata, 'completed');
    return {
      text: renderExecutionCompletedPacket(run),
      response_type: 'execution_completed',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (ESCALATION_RE.test(trimmed)) {
    return {
      text: renderEscalationPacket(run, trimmed),
      response_type: 'execution_escalation',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  const pmIntent = detectPMIntent(trimmed);

  if (pmIntent === 'completion_check') {
    detectAndApplyCompletion(run.run_id);
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    if (eval_?.overall_status === 'completed') {
      updateRunStage(run.run_id, 'completed');
      transitionProjectIntakeStage(metadata, 'completed');
      return {
        text: renderExecutionCompletedPacket(run),
        response_type: 'execution_completed',
        packet_id: run.packet_id,
        run_id: run.run_id,
      };
    }
    return {
      text: renderPMCockpitPacket(run),
      response_type: 'execution_reporting_status',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (pmIntent === 'retry') {
    retryRunOutbound(run.run_id, metadata).catch(() => {});
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    return {
      text: renderRetryResponsePacket(run, eval_),
      response_type: 'execution_retry',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (pmIntent === 'manual_status' || pmIntent === 'blocked_status') {
    detectAndApplyCompletion(run.run_id);
    return {
      text: renderManualActionsPacket(run),
      response_type: 'execution_manual_status',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (pmIntent === 'progress') {
    detectAndApplyCompletion(run.run_id);
    if (run.current_stage === 'deploy_ready') {
      const deployPacket = buildUnifiedDeployPacket(run.run_id);
      return {
        text: renderPMCockpitPacket(run) + '\n\n' + renderDeployPacket(run, deployPacket || {}),
        response_type: 'execution_deploy_ready',
        packet_id: run.packet_id,
        run_id: run.run_id,
      };
    }
    return {
      text: renderPMCockpitPacket(run),
      response_type: 'execution_reporting_status',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  detectAndApplyCompletion(run.run_id);

  // Auto-escalation for manual_blocked state
  const autoEval = evaluateExecutionRunCompletion(run.run_id);
  if (autoEval?.overall_status === 'manual_blocked') {
    const blockerDesc = (autoEval.manual_required_lanes || []).map(l => `${l} lane: 수동 조치 필요`).join('\n');
    return {
      text: renderEscalationPacket(run, `실행 중 수동 조치가 필요한 lane이 있습니다.\n${blockerDesc}\n\n조치 후 "다시 시도해"로 재실행하거나, 필요 사항을 알려주세요.`),
      response_type: 'execution_auto_escalation',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  // Approval response detection — founder replies to deploy_ready approval packet
  if (run.current_stage === 'deploy_ready' || run.current_stage === 'paused_for_founder') {
    const approvalIntent = detectApprovalIntent(trimmed);
    if (approvalIntent) {
      const result = applyApprovalDecision(run, approvalIntent, trimmed);
      return {
        text: result.response_text,
        response_type: `execution_approval_${approvalIntent}`,
        packet_id: run.packet_id,
        run_id: run.run_id,
      };
    }
  }

  if (run.current_stage === 'deploy_ready') {
    const deployPacket = buildUnifiedDeployPacket(run.run_id);
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    return {
      text: renderApprovalPacket(run, {
        completed_work: (eval_?.completed_lanes || []).map(l => `${l} lane 완료`),
        blockers: (eval_?.blocking_lanes || []).map(l => `${l} lane 차단 중`),
        decision_needed: '배포 진행 여부',
        options: ['배포 승인', '추가 수정 요청', '보류'],
        recommendation: deployPacket?.overall_deploy_readiness === 'ready'
          ? '배포 준비 완료 — 승인 후 배포를 진행합니다.'
          : '수동 배포 필요 — 아래 안내를 따라 진행해 주세요.',
      }) + '\n\n' + renderDeployPacket(run, deployPacket || {}),
      response_type: 'execution_approval_deploy',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  return {
    text: renderExecutionRunningPacket(run),
    response_type: 'execution_running_status',
    packet_id: run.packet_id,
    run_id: run.run_id,
  };
}

/**
 * Build a comprehensive execution status packet for a run.
 */
export function renderExecutionStatusPacket(run) {
  if (!run) return '[COS] 실행 정보가 없습니다.';

  const eval_ = evaluateExecutionRunCompletion(run.run_id);
  const deployInfo = evaluateDeployReadiness(run.run_id);
  const githubDiag = diagnoseGithubConfig();
  const cursorStatus = getCursorOperationalStatus(run.run_id);

  const lines = [
    `*[실행 상태 보고]*`,
    `\`${run.run_id}\` · ${String(run.project_goal || '').slice(0, 100)}`,
    '',
    `*단계*: ${run.current_stage}`,
    `*전체 상태*: ${eval_?.overall_status || 'unknown'}`,
    '',
    '*Lane 현황*',
  ];

  for (const ws of (run.workstreams || [])) {
    const st = ws.outbound?.outbound_status || 'pending';
    const icon = st === 'completed' ? '✅' : st === 'dispatched' ? '🔄' : st === 'failed' ? '❌' : '⏳';
    lines.push(`  ${icon} ${ws.lane_type}: ${st}`);
  }

  lines.push('');
  const git = run.git_trace || {};
  const ghParts = [];
  if (git.issue_id) ghParts.push(`issue #${git.issue_id}`);
  if (git.branch) ghParts.push(`branch: ${git.branch}`);
  if (git.pr_id) ghParts.push(`PR #${git.pr_id}`);
  lines.push(`*GitHub*: ${ghParts.length ? ghParts.join(' · ') : 'none'} (${githubDiag.mode})`);
  lines.push(`*Cursor*: ${cursorStatus?.status || 'unknown'}`);
  lines.push(`*배포*: ${deployInfo?.deploy_readiness || 'not_ready'} (${run.deploy_status || 'none'})`);

  if (eval_?.next_actions?.length) {
    lines.push('', '*다음 조치*');
    for (const a of eval_.next_actions) {
      lines.push(`- ${a}`);
    }
  }

  return lines.join('\n');
}
