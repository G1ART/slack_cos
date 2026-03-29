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

/* ------------------------------------------------------------------ */
/*  Execution-phase renderers                                          */
/* ------------------------------------------------------------------ */

export function renderExecutionRunningPacket(run) {
  const lanes = (run.workstreams || [])
    .map((w) => `- \`${w.lane_type}\`: ${w.objective.slice(0, 100)}`)
    .join('\n');
  const git = run.git_trace || {};
  const gitLine = git.branch
    ? `- branch: \`${git.branch}\`${git.issue_id ? ` · issue: \`${git.issue_id}\`` : ''}`
    : '- Git seed: 생성 예정';

  return [
    `*[실행 개시 · 내부 오케스트레이션]*`,
    `\`${run.run_id}\` · packet \`${run.packet_id}\``,
    '',
    `*목표:* ${String(run.project_goal || '').slice(0, 300)}`,
    '',
    '*내부 lane 배정*',
    lanes || '- (없음)',
    '',
    '*Git trace*',
    gitLine,
    '',
    '*다음 보고:* 초안 산출물 묶음 준비 시',
    '',
    '_대표 표면은 결과·에스컬레이션 위주로 유지합니다._',
  ].join('\n');
}

export function renderExecutionReportingPacket(run) {
  const report = run.latest_report || '(아직 보고 없음)';
  const activeLanes = (run.workstreams || []).filter((w) => w.status !== 'done');
  const doneLanes = (run.workstreams || []).filter((w) => w.status === 'done');
  return [
    `*[실행 진행 보고]*`,
    `\`${run.run_id}\``,
    '',
    `*현재 단계:* \`${run.current_stage}\``,
    '',
    '*완료 lane*',
    doneLanes.length
      ? doneLanes.map((w) => `- ✅ \`${w.lane_type}\``).join('\n')
      : '- (아직 없음)',
    '',
    '*진행 중 lane*',
    activeLanes.length
      ? activeLanes.map((w) => `- ⏳ \`${w.lane_type}\`: ${w.status}`).join('\n')
      : '- (없음)',
    '',
    '*최신 보고*',
    String(report).slice(0, 1200),
  ].join('\n');
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

const PROGRESS_RE = /(?:progress|진행\s*(?:상황|보고|요약))|지금\s*어디|현황|보고\s*해|status/i;
const ESCALATION_RE = /에스컬레이션|내\s*승인\s*없이는|대표\s*결정|escalat/i;
const COMPLETION_RE = /실행\s*완료|프로젝트\s*완료|종료/i;

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

  if (PROGRESS_RE.test(trimmed)) {
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

  return {
    text: renderExecutionRunningPacket(run),
    response_type: 'execution_running_status',
    packet_id: run.packet_id,
    run_id: run.run_id,
  };
}
