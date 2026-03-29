/**
 * Active build thread: canonical **ProjectSpecSession** mutation.
 * 인테이크 활성 스레드에서는 이 모듈이 대표 표면 최종 응답을 소유( Council 메모 composer 금지 ).
 */

import { buildSlackThreadKey } from './slackConversationBuffer.js';
import { isCouncilCommand } from '../slack/councilCommandPrefixes.js';
import {
  getProjectIntakeSession,
  isActiveProjectIntake,
  isPreLockIntake,
  touchProjectIntakeSession,
  touchProjectIntakeSessionSpec,
  transitionProjectIntakeStage,
} from './projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun } from './executionRun.js';
import { dispatchOutboundActionsForRun } from './executionOutboundOrchestrator.js';
import {
  createProjectSpecSession,
  seedSpecMvpDefaultsFromProblem,
  PROJECT_SPEC_BUILD_ZONE_BANNED_SUBSTRINGS,
} from './projectSpecModel.js';
import { tryFinalizeSlackQueryRoute } from './queryOnlyRoute.js';
import { tryFinalizeG1CosLineageTransport } from './g1cosLineageTransport.js';
import {
  normalizePlannerInputForRoute,
  analyzePlannerResponderLock,
} from './plannerRoute.js';
import { appendWorkspaceQueueItem } from './cosWorkspaceQueue.js';

const R = Object.freeze({
  primaryUsageLine: /개인\/?팀[^\n]{0,60}일정[^\n]*/u,
  recurrence: /반복\s*일정|반복/u,
  backlogFuture: /미래\s*(?:단계|후속)|블랙아웃|결제|가격/u,
  proceed: /진행해줘|진행\s*해줘|진행|고고|go\s*ahead|proceed|execute|실행해줘/i,
  mvpAssumptionOk: /MVP\s*가정\s*정확|MVP\s*가정/u,
  qNumbered: /^\s*[123]\s*[\.\)]\s*(.+)$/gm,
});

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractApprovalRules(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim());
  const out = [];
  let capture = false;
  for (let i = 0; i < lines.length; i += 1) {
    const L = lines[i];
    if (/승인\s*규칙/u.test(L)) {
      capture = true;
      const after = L.replace(/^.*승인\s*규칙\s*\d*종?\s*/u, '').trim();
      if (after.length > 2 && !/^\d+종?$/.test(after)) out.push(after.replace(/^[-*•]\s*/, '').trim());
      continue;
    }
    if (!capture) continue;
    if (!L) {
      if (out.length) break;
      continue;
    }
    if (/^미래|^MVP\s*가정|^진행/u.test(L)) break;
    const cleaned = L.replace(/^[-*•]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
    if (cleaned.length >= 2) out.push(cleaned);
    if (out.length >= 8) break;
  }
  return out.filter(Boolean);
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function extractStructuredAnswers(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  const out = {};

  if (R.mvpAssumptionOk.test(raw)) out.mvp_assumption = 'confirmed';

  const pu = raw.match(R.primaryUsageLine);
  if (pu && pu[0]) out.primary_usage = pu[0].trim();

  if (R.recurrence.test(raw)) out.recurrence = 'required';

  let m;
  const qre = new RegExp(R.qNumbered.source, R.qNumbered.flags);
  while ((m = qre.exec(raw)) !== null) {
    const line = String(m[1] || '').trim();
    const qm = line.match(/^([^\?:：]+)[?:：]\s*(.+)$/);
    if (qm) out[`qa_${qm[1].trim().slice(0, 40)}`] = qm[2].trim();
  }

  return out;
}

/** @param {string} text */
export function extractFutureBacklog(text) {
  const raw = String(text || '');
  const lines = raw.split('\n').map((l) => l.trim());
  const out = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^MVP\s*가정/u.test(line)) continue;
    if (R.backlogFuture.test(line) || /^미래/u.test(line)) {
      const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+\s*[\.\)]\s*/, '').trim();
      if (cleaned.length >= 4) out.push(cleaned);
    }
  }
  return [...new Set(out)].slice(0, 20);
}

/** @param {string} text */
export function extractProceedIntent(text) {
  return R.proceed.test(String(text || ''));
}

/**
 * @param {any} session
 * @param {Record<string, string>} answers
 * @param {string[]} futureBacklog
 * @param {boolean} proceed
 * @param {string[]} approvalRules
 */
export function mergeIntoProjectSpecSession(session, answers, futureBacklog, proceed, approvalRules) {
  const s = session && typeof session === 'object' ? session : {};
  const a = answers && typeof answers === 'object' ? answers : {};
  const fb = Array.isArray(futureBacklog) ? futureBacklog : [];
  const ar = Array.isArray(approvalRules) ? approvalRules : [];

  if (a.primary_usage) s.primary_user_context = String(a.primary_usage);
  if (a.recurrence) s.answers = { ...s.answers, recurrence: String(a.recurrence) };
  if (a.mvp_assumption) s.answers = { ...s.answers, mvp_assumption: String(a.mvp_assumption) };

  for (const k of Object.keys(a)) {
    if (k.startsWith('qa_')) s.answers = { ...s.answers, [k]: String(a[k]) };
  }

  for (const rule of ar) {
    const t = String(rule).trim();
    if (t && !s.approval_rules.includes(t)) s.approval_rules.push(t);
  }

  for (const item of fb) {
    const t = String(item).trim();
    if (t && !s.future_phase_backlog.includes(t)) s.future_phase_backlog.push(t);
  }

  if (proceed) s.proceed_requested = true;

  const now = new Date().toISOString();
  s.updated_at = now;
  if (s.stage === 'explore' && (Object.keys(a).length || fb.length || ar.length || proceed)) s.stage = 'refine';
  return s;
}

/**
 * @param {any} session
 */
export function computeSufficiency(session) {
  const s = session || {};
  const missing = [];

  const problem = String(s.problem_statement || '').trim();
  if (problem.length < 8) missing.push('problem_statement');

  const usage = String(s.primary_user_context || s.answers?.primary_usage || '').trim();
  if (!usage) missing.push('primary_user_context');

  const hasRec = String(s.answers?.recurrence || '').trim() === 'required' || s.answers?.recurrence === 'required';
  if (!hasRec) missing.push('recurrence');

  const inc = Array.isArray(s.includes) ? s.includes : [];
  const exc = Array.isArray(s.excludes) ? s.excludes : [];
  if (inc.length < 1) missing.push('mvp_includes');
  if (exc.length < 1) missing.push('mvp_excludes');

  const rules = Array.isArray(s.approval_rules) ? s.approval_rules : [];
  if (rules.length < 1) missing.push('approval_rules');

  const nearSufficient = missing.length <= 1;
  const sufficient = missing.length === 0;
  return { sufficient, nearSufficient, missing };
}

/**
 * @param {string} text
 */
export function buildZoneOutputContainsBanned(text) {
  const t = String(text || '');
  return PROJECT_SPEC_BUILD_ZONE_BANNED_SUBSTRINGS.some((b) => t.includes(b));
}

/** @param {string} m */
function missingLabel(m) {
  const map = {
    problem_statement: '프로젝트 목표(문제 정의)',
    primary_user_context: '주요 사용 맥락(누가/어떻게 쓰는지)',
    recurrence: '반복 일정 필요 여부',
    mvp_includes: 'v1 포함 범위',
    mvp_excludes: 'v1 제외 범위',
    approval_rules: '승인/운영 규칙',
  };
  return map[m] || m;
}

/**
 * @param {any} spec
 * @param {{ sufficient: boolean, nearSufficient: boolean, missing: string[] }} suff
 */
export function renderProjectSpecRefinementSurface(spec, suff) {
  const lines = [
    '**범위 보강**',
    '',
    '아직 필요한 항목:',
    ...(suff.missing.length ? suff.missing.map((x) => `- ${missingLabel(x)}`) : ['- (없음)']),
  ];
  if (suff.missing.length > 1) {
    lines.push('', '한 가지만 알려 주시면 다음 단계로 넘어갑니다.');
  }
  return lines.join('\n');
}

function ensureIntakeSpec(metadata, intake) {
  if (!intake) return null;
  if (intake.spec && typeof intake.spec === 'object') {
    seedSpecMvpDefaultsFromProblem(intake.spec);
    return intake.spec;
  }
  const key = buildSlackThreadKey(metadata);
  const ownerId = String(metadata?.user || metadata?.user_id || '');
  const spec = createProjectSpecSession(intake.goalLine, key, ownerId);
  seedSpecMvpDefaultsFromProblem(spec);
  intake.spec = spec;
  touchProjectIntakeSessionSpec(metadata, spec);
  return spec;
}

/**
 * @param {{
 *   trimmed: string,
 *   metadata: Record<string, unknown>,
 *   routerCtx: { raw_text?: unknown, normalized_text: string },
 *   previewOnly?: boolean,
 * }} ctx
 */
export async function tryFinalizeProjectSpecBuildThread(ctx) {
  const { trimmed, metadata, routerCtx, previewOnly = false } = ctx;
  if (!trimmed || !metadata || typeof metadata !== 'object') return null;
  if (!isPreLockIntake(metadata)) return null;

  const intake = getProjectIntakeSession(metadata);
  if (!intake) return null;

  const spec = ensureIntakeSpec(metadata, intake);
  if (!spec) return null;

  const queryFinalized = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
  if (queryFinalized != null) return null;

  const lineageHit = await tryFinalizeG1CosLineageTransport(trimmed, routerCtx);
  if (lineageHit != null) return null;

  const plannerLock = analyzePlannerResponderLock(normalizePlannerInputForRoute(trimmed));
  if (plannerLock.type !== 'none') return null;

  if (isCouncilCommand(trimmed)) {
    return { kind: 'council_deferred' };
  }

  touchProjectIntakeSession(metadata);

  const answers = extractStructuredAnswers(trimmed);
  const futureBacklog = extractFutureBacklog(trimmed);
  const proceed = extractProceedIntent(trimmed);
  const approvalRules = extractApprovalRules(trimmed);
  mergeIntoProjectSpecSession(spec, answers, futureBacklog, proceed, approvalRules);
  touchProjectIntakeSessionSpec(metadata, spec);

  const suff = computeSufficiency(spec);
  const canExecReady = suff.sufficient || (suff.nearSufficient && spec.proceed_requested === true);

  if (canExecReady) {
    spec.stage = 'execution_ready';
    spec.last_owner_facing_packet = 'execution_ready';
    spec.mvp_summary = String(spec.mvp_summary || spec.problem_statement || '').trim() || null;
    touchProjectIntakeSessionSpec(metadata, spec);

    const lines = [
      '**잠긴 MVP 요약**',
      String(spec.mvp_summary || spec.problem_statement || '').trim() || '(요약)',
      '',
      '**v1 포함**',
      ...(spec.includes || []).length ? spec.includes.map((x) => `- ${x}`) : ['- (정의됨)'],
      '',
      '**v1 제외**',
      ...(spec.excludes || []).length ? spec.excludes.map((x) => `- ${x}`) : ['- (정의됨)'],
      '',
      '**후속 단계로 미루는 항목**',
      ...(spec.future_phase_backlog || []).length
        ? spec.future_phase_backlog.map((x) => `- ${x}`)
        : ['- (없음)'],
      '',
      '**내부 실행 배정**',
      '- COS가 실행 패킷·작업 시드로 연결합니다.',
      '',
      '**지금 생성할 artifact**',
      '- 실행 스캐폴드·작업 큐 시드(내부)',
    ];
    const textOut = lines.join('\n');

    let packet_id = null;
    let run_id = null;

    if (!previewOnly) {
      const threadKey = buildSlackThreadKey(metadata);
      const packet = createExecutionPacket({
        thread_key: threadKey,
        goal_line: spec.problem_statement || '',
        locked_scope_summary: spec.mvp_summary || spec.problem_statement || '',
        includes: spec.includes || [],
        excludes: spec.excludes || [],
        deferred_items: spec.future_phase_backlog || [],
        approval_rules: spec.approval_rules || [],
        session_id: spec.session_id || '',
        requested_by: String(metadata?.user || ''),
      });

      const run = createExecutionRun({ packet, metadata });
      packet_id = packet.packet_id;
      run_id = run.run_id;

      // Auto-dispatch outbound (fire-and-forget; errors handled per-lane)
      dispatchOutboundActionsForRun(run, metadata).catch((err) => {
        console.warn('[projectSpecSession] auto-dispatch error:', err?.message || err);
      });

      transitionProjectIntakeStage(metadata, 'execution_running', {
        packet_id,
        run_id,
      });

      try {
        const body = `[execution_approval_packet]\npacket_id: ${packet_id}\nrun_id: ${run_id}\nproject_spec_session: ${JSON.stringify({
          problem_statement: spec.problem_statement,
          mvp_summary: spec.mvp_summary,
          includes: spec.includes,
          excludes: spec.excludes,
          approval_rules: spec.approval_rules,
          future_phase_backlog: spec.future_phase_backlog,
          answers: spec.answers,
        }).slice(0, 12000)}\n\n대표 확인:\n${trimmed.slice(0, 6000)}`;
        await appendWorkspaceQueueItem({
          kind: 'spec_intake',
          body,
          metadata,
          channelContext: null,
        });
      } catch {
        /* 큐 실패해도 대표 표면은 유지 */
      }
    }

    return {
      kind: 'execution_ready',
      text: textOut,
      packet_id,
      run_id,
      response_type: 'project_spec_execution_ready',
    };
  }

  return {
    kind: 'refine',
    text: renderProjectSpecRefinementSurface(spec, suff),
    response_type: 'project_spec_refine',
  };
}
