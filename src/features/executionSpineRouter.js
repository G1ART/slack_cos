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
} from './executionRun.js';
import { collectOutboundStatus, formatOutboundStatusForSlack, retryRunOutbound } from './executionOutboundOrchestrator.js';
import {
  evaluateExecutionRunCompletion,
  detectAndApplyCompletion,
  detectPMIntent,
  diagnoseGithubConfig,
  getCursorOperationalStatus,
  buildSupabaseManualApplyInstructions,
  computeLaneDispatchPlan,
  scanPendingCursorResults,
} from './executionDispatchLifecycle.js';

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

  lines.push('', '*Provider 현황*');
  lines.push(`- GitHub: ${ghDiag.configured ? '✅ live' : `⚠️ draft_only (미설정: ${ghDiag.missing.join(', ')})`}`);
  lines.push(`- Cursor: ${cursorSt ? `${statusMap[cursorSt.status] || '❓'} ${cursorSt.status}` : '❓ unknown'}`);
  if (cursorSt?.status === 'result_ingested' && cursorSt.result_summary) {
    lines.push(`  결과: ${cursorSt.result_summary.slice(0, 120)}`);
  }
  const supaLane = (run.workstreams || []).find((w) => w.outbound?.outbound_provider === 'supabase');
  const supaStatus = supaLane?.outbound?.outbound_status || 'pending';
  lines.push(`- Supabase: ${statusMap[supaStatus] || '⏳'} ${supaStatus}${supaSt?.draft_path !== '(no draft created)' ? ' (draft 있음)' : ''}`);

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

  if (eval_?.next_actions?.length) {
    lines.push('', '*다음 필요 액션*');
    for (const a of eval_.next_actions) lines.push(`- ${a}`);
  }

  const retryable = (eval_?.failed_lanes?.length || 0) > 0;
  if (retryable) lines.push('', '_"다시 시도해" 로 실패 lane 재실행 가능_');

  if (report) {
    lines.push('', '*최신 보고*', String(report).slice(0, 600));
  }

  return lines.filter(Boolean).join('\n');
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

export function renderPMCockpitPacket(run) {
  return renderExecutionReportingPacket(run);
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
/*  Progress / escalation intent detection                             */
/* ------------------------------------------------------------------ */

const PROGRESS_RE = /(?:progress|진행\s*(?:상황|보고|요약))|지금\s*어디|현황|보고\s*해|status|어디까지\s*됐/i;
const ESCALATION_RE = /에스컬레이션|내\s*승인\s*없이는|대표\s*결정|escalat/i;
const COMPLETION_RE = /실행\s*완료|프로젝트\s*완료|종료/i;
const RETRY_RE = /retry|재시도|다시\s*(?:해|시도)|재실행/i;
const MANUAL_ASK_RE = /manual\s*action|수동\s*조치|뭐\s*남았|남은\s*작업|내가\s*해야\s*할|수동으로/i;
const BLOCKED_ASK_RE = /뭐가\s*막혔|blocked|어떤\s*lane.*기다|waiting/i;
const DONE_CHECK_RE = /다\s*끝났어|이\s*run\s*끝났|all\s*done|finished|완료\s*됐어/i;

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

  if (DONE_CHECK_RE.test(trimmed)) {
    detectAndApplyCompletion(run.run_id);
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    const isComplete = eval_?.overall_status === 'completed';
    if (isComplete) {
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
      text: renderExecutionReportingPacket(run),
      response_type: 'execution_reporting_status',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (RETRY_RE.test(trimmed)) {
    retryRunOutbound(run.run_id, metadata).catch(() => {});
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    return {
      text: renderRetryResponsePacket(run, eval_),
      response_type: 'execution_retry',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (MANUAL_ASK_RE.test(trimmed) || BLOCKED_ASK_RE.test(trimmed)) {
    detectAndApplyCompletion(run.run_id);
    return {
      text: renderManualActionsPacket(run),
      response_type: 'execution_manual_status',
      packet_id: run.packet_id,
      run_id: run.run_id,
    };
  }

  if (PROGRESS_RE.test(trimmed)) {
    detectAndApplyCompletion(run.run_id);
    return {
      text: renderExecutionReportingPacket(run),
      response_type: 'execution_reporting_status',
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

  detectAndApplyCompletion(run.run_id);

  return {
    text: renderExecutionRunningPacket(run),
    response_type: 'execution_running_status',
    packet_id: run.packet_id,
    run_id: run.run_id,
  };
}
