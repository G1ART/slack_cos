/**
 * Slack structured commands — former `handleUserText` bulk (env, storage, plans, work, GitHub, Cursor, …).
 * Invoked from `runInboundCommandRouter` when top-level planner lock is `none` (not `hit` / `miss`).
 * Fall-through (`undefined`): caller runs `runInboundAiRouter`.
 */

import { DECISIONS_FILE, LESSONS_FILE } from '../storage/paths.js';
import { appendJsonRecord, getRecentRecords } from '../storage/jsonStore.js';
import { setChannelContext, clearChannelContext } from '../storage/channelContext.js';
import {
  getProjectContext,
  setProjectContext,
  clearProjectContext,
} from '../storage/projectContext.js';
import {
  getPendingApprovals,
  parseApprovalAction,
  updateApprovalStatus,
  formatPendingApprovals,
  formatPendingApprovalsSummary,
  formatApprovalUpdate,
} from './approvals.js';
import {
  buildDecisionHighlights,
  buildLessonHighlights,
  buildRiskHighlights,
  buildWeeklyBrief,
  buildExecutiveReport,
} from './briefs.js';
import {
  PROJECT_KEYS,
  parseWorkRegisterText,
  createWorkItem,
  listWorkItems,
  getWorkItem,
  updateWorkStatus,
  assignWorkItem,
  summarizeWorkItems,
  formatWorkItemList,
  formatWorkUpdate,
  updateWorkItemGithubFields,
  updateWorkItemSupabaseFields,
  updateWorkItemCursorFields,
} from './workItems.js';
import {
  getPlan,
  approvePlan,
  rejectPlan,
  formatPlanWorkList,
  getPlanGateMessageForWorkItem,
  listRecentPlansForAlias,
  bridgePlanToDispatch,
  formatPlansOverviewSlack,
  markPlanInProgress,
  markPlanDone,
  markPlanBlocked,
  appendPlanHoldNote,
} from './plans.js';
import {
  createWorkRun,
  listWorkRuns,
  getWorkRun,
  updateRunStatus,
  retryRun,
  submitRunResult,
  reviewRunResult,
  approveRunResult,
  rejectRunResult,
  markRunBlocked,
  formatRunList,
  formatRunDetail,
  getLatestRunByWorkId,
  getLatestCursorRunForWork,
  generateQaChecklist,
} from './workRuns.js';
import {
  createAdapterRunPayload,
  formatDispatchForSlack as formatRunDispatchForSlack,
  parseResultIntakeByTool,
  formatReviewForSlack,
} from '../adapters/index.js';
import { getRepoForProjectEnv, setRepoForProject, clearRepoForProject } from '../storage/repoRegistry.js';
import {
  prepareDispatch as prepareGithubDispatch,
  resolveGitHubRepoTarget,
  isGithubAuthConfigured,
  getGithubAuthMode,
  createIssueArtifact,
  getIssueStatus,
  formatGithubIssueCommandError,
  runGithubPrecheck,
  formatGithubPrecheckForSlack,
} from '../adapters/githubAdapter.js';
import {
  getDefaultDbForProject,
  getDbForProjectEnv,
  setDbForProject,
  clearDbForProject,
} from '../storage/supabaseRegistry.js';
import {
  getEnvironmentProfile,
  getDefaultEnvKey,
} from '../storage/environmentProfiles.js';
import {
  buildCursorHandoffMarkdown,
  writeCursorHandoffFile,
  buildCursorHandoffArtifact,
  extractGithubIssueFromWorkItem,
  inferCursorIngestResultStatus,
  mergeCursorHandoffResult,
  formatCursorHandoffSummaryLines,
} from './cursorHandoff.js';
import {
  getEnvironmentContext,
  setEnvironmentContext,
  clearEnvironmentContext,
} from '../storage/environmentContext.js';
import { prepareDispatch as prepareSupabaseDispatch } from '../adapters/supabaseAdapter.js';
import { collectHealthSnapshot, formatHealthSnapshot } from '../runtime/health.js';
import { validateEnv, formatEnvCheck } from '../runtime/env.js';
import {
  JOB_NAMES,
  getAutomationSettings,
  setAutomationJobEnabled,
  formatAutomationSettings,
  runAutomationJob,
} from '../automation/index.js';
import { getStoreCore } from '../storage/core/index.js';
import {
  buildMigrationPlan,
  formatMigrationPlanForSlack,
} from '../storage/core/migrateJsonToSupabase.js';
import { logStructuredCommandToolRegistry } from './cosToolRuntime.js';
import {
  appendWorkspaceQueueItem,
  listWorkspaceQueueRecent,
  formatWorkspaceQueueSaved,
  formatWorkspaceQueueList,
  tryParseNaturalWorkspaceQueueIntake,
  formatNaturalWorkspaceQueueHint,
} from './cosWorkspaceQueue.js';
import {
  appendCustomerFeedbackWithAwqDraft,
  formatCustomerFeedbackIntakeComplete,
} from './customerFeedbackAwqBridge.js';
import {
  promoteWorkspaceQueueSpecToPlan,
  formatWorkspaceQueuePromoteSlack,
  findLatestPromotableWorkspaceQueueId,
} from './workspaceQueuePromote.js';
import {
  getAgentWorkQueueItem,
  patchAgentWorkQueueItem,
  linkAgentWorkQueueRunForWork,
  appendAgentWorkQueueProofById,
  appendAgentWorkQueueProofByLinkedRun,
  appendAgentWorkQueueProofByLinkedWork,
} from './agentWorkQueue.js';
import {
  fireAgentBridgeNotify,
  handoffMarkdownForBridge,
  safeJsonSlice,
  slackSourceForBridge,
} from './agentBridgeOutbound.js';

/** @param {string} runId @param {unknown} awqRow */
function formatAwqRunLinkTail(runId, awqRow) {
  if (!awqRow || typeof awqRow !== 'object' || !/** @type {any} */ (awqRow).id) return '';
  const row = /** @type {any} */ (awqRow);
  const rid = String(runId || '').trim();
  const hasRun = row.linked_run_id != null && String(row.linked_run_id).trim() === rid;
  const proofOnly = !hasRun && Array.isArray(row.proof_refs);
  return proofOnly
    ? `\n- 에이전트 워크큐 \`${row.id}\`: 기존 run 유지 · 증거에 \`dispatch_run:${rid}\` 추가`
    : `\n- 에이전트 워크큐 \`${row.id}\`: \`linked_run_id\` ← \`${rid}\``;
}

export async function runInboundStructuredCommands(ctx) {
  const {
    trimmed,
    metadata,
    channelContext,
    projectContext,
    envKey,
    MODEL,
    RUNTIME_MODE,
    makeId,
    formatError,
    AGENT_OPTIONS,
    formatGithubIssuePublishSuccessLines,
    formatGithubIssuePersistFailedLines,
    parseDecisionRecord,
    parseLessonRecord,
    formatDecisionSaved,
    formatLessonSaved,
    formatRecentDecisions,
    formatRecentLessons,
    parseRecentCount,
    parseDays,
    parseWorkToken,
    parseChannelSetting,
    parseProjectSetting,
    parseWorkAssign,
    parseWorkBlock,
    parsePlanReject,
    parsePlanBlockCmd,
    parseWorkRevisionRequest,
    parseRepoSetting,
    parseDbSetting,
    parseGithubMergeReject,
    parseRollbackReject,
    parseResultRegister,
    parseCursorResultRecord,
    resolveCursorRunFromToken,
    parseResultReject,
    parseBlockedRun,
  } = ctx;

  logStructuredCommandToolRegistry(trimmed);

  const naturalQueue = tryParseNaturalWorkspaceQueueIntake(trimmed);
  if (naturalQueue) {
    if (!String(naturalQueue.body || '').trim()) {
      return formatNaturalWorkspaceQueueHint(naturalQueue.kind);
    }
    if (naturalQueue.kind === 'customer_feedback') {
      const pack = await appendCustomerFeedbackWithAwqDraft({
        body: naturalQueue.body,
        metadata,
        channelContext,
      });
      return formatCustomerFeedbackIntakeComplete(pack);
    }
    const record = await appendWorkspaceQueueItem({
      kind: naturalQueue.kind,
      body: naturalQueue.body,
      metadata,
      channelContext,
    });
    return formatWorkspaceQueueSaved(record, { natural: true });
  }

  if (trimmed === '상태점검') {
    const snapshot = await collectHealthSnapshot({
      model: MODEL,
      projectKey: projectContext,
      envKey,
      channelId: metadata.channel || null,
    });
    return formatHealthSnapshot(snapshot);
  }

  if (trimmed === '환경점검') {
    const envCheck = validateEnv();
    const envProfile = await getEnvironmentProfile(envKey);
    const projectKey = projectContext || null;
    const resolvedRepo = projectKey ? await getRepoForProjectEnv(projectKey, envKey) : null;
    const resolvedDb = projectKey ? await getDbForProjectEnv(projectKey, envKey) : null;
    const hostedReadiness = RUNTIME_MODE !== 'hosted' ? 'not_ready' : envCheck.ok ? 'ready' : 'not_ready_env_missing';
    const store = getStoreCore();
    let supaConn = null;
    try {
      if (store.supabase_configured) supaConn = await store.checkSupabaseConnectivity('g1cos_work_items');
    } catch {
      supaConn = { ok: false, error: 'connectivity_check_failed' };
    }
    return (
      formatEnvCheck(envCheck) +
      `\n- current env profile: ${envKey} (${envProfile.display_name})` +
      `\n- resolved repo: ${resolvedRepo || 'manual'}` +
      `\n- resolved db: ${resolvedDb || 'manual'}` +
      `\n- hosted readiness rough: ${hostedReadiness}` +
      `\n- storage mode: ${store.storage_mode}` +
      `\n- supabase configured: ${store.supabase_configured ? 'yes' : 'no'}` +
      `\n- supabase connectivity actual: ${supaConn?.ok ? 'pass' : 'fail'}` +
      (supaConn?.ok ? '' : ` (${supaConn?.error || 'error'})`) +
      `\n- storage read preference: ${store.storage_read_preference}` +
      `\n- live dual-write collections: ${store.live_dual_write_collections?.length ? store.live_dual_write_collections.join(', ') : 'none'}`
    );
  }

  if (trimmed.startsWith('환경프로필설정:')) {
    const match = trimmed.match(/^환경프로필설정:\s*(dev|staging|prod)\s*$/);
    if (!match) return '형식: 환경프로필설정: dev | staging | prod';
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 환경프로필을 설정할 수 없습니다. 채널에서 실행해주세요.';
    }
    await setEnvironmentContext(metadata.channel, match[1]);
    return `환경프로필 설정 완료: ${match[1]}`;
  }

  if (trimmed === '현재환경프로필') {
    return `현재 환경프로필: ${envKey}`;
  }

  if (trimmed.startsWith('워크큐실행허가')) {
    const token = parseWorkToken(trimmed, '워크큐실행허가');
    if (!token) return '[워크큐실행허가] 형식: 워크큐실행허가 <AWQ-…>';
    if (!/^AWQ-/i.test(token)) return `[워크큐실행허가] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐실행허가] 항목 없음: ${token}`;
    if (prev.status === 'cancelled' || prev.status === 'done') {
      return `[워크큐실행허가] 현재 상태 \`${prev.status}\` — 갱신하지 않음: ${token}`;
    }
    if (prev.status === 'queued') {
      const w =
        prev.linked_work_id ||
        (Array.isArray(prev.linked_work_ids) && prev.linked_work_ids.length
          ? String(prev.linked_work_ids[0]).trim()
          : null);
      const tail = w
        ? `\n다음: \`커서발행 ${w}\` · \`이슈발행 ${w}\` · \`수파베이스발행 ${w}\``
        : '\n다음: WRK 연결 후 발행 명령';
      return `[워크큐실행허가] 이미 \`queued\`: ${token}${tail}`;
    }
    const next = await patchAgentWorkQueueItem(token, { status: 'queued' });
    if (!next) return `[워크큐실행허가] 갱신 실패: ${token}`;
    const w =
      next.linked_work_id ||
      (Array.isArray(next.linked_work_ids) && next.linked_work_ids.length
        ? String(next.linked_work_ids[0]).trim()
        : null);
    const tail = w
      ? `\n다음: \`커서발행 ${w}\` · \`이슈발행 ${w}\` · \`수파베이스발행 ${w}\``
      : '\n다음: WRK 연결 후 발행 명령';
    return `[워크큐실행허가] 완료 — \`${token}\` \`${prev.status}\` → \`queued\`${tail}`;
  }

  if (trimmed.startsWith('워크큐취소')) {
    const token = parseWorkToken(trimmed, '워크큐취소');
    if (!token) return '[워크큐취소] 형식: 워크큐취소 <AWQ-…>';
    if (!/^AWQ-/i.test(token)) return `[워크큐취소] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐취소] 항목 없음: ${token}`;
    if (prev.status === 'cancelled') {
      return `[워크큐취소] 이미 \`cancelled\`: ${token}`;
    }
    if (prev.status === 'done') {
      return `[워크큐취소] 완료된 항목은 취소하지 않음: ${token}`;
    }
    const next = await patchAgentWorkQueueItem(token, { status: 'cancelled' });
    if (!next) return `[워크큐취소] 갱신 실패: ${token}`;
    return `[워크큐취소] 완료 — \`${token}\` → \`cancelled\` (이전 \`${prev.status}\`)`;
  }

  if (trimmed.startsWith('워크큐증거')) {
    const m = trimmed.match(/^워크큐증거\s+(\S+)(?:\s+([\s\S]+))?$/u);
    if (!m?.[1]) return '[워크큐증거] 형식: 워크큐증거 <AWQ-…> <한 줄>';
    const token = m[1];
    const proofRaw = (m[2] || '').trim();
    if (!/^AWQ-/i.test(token)) return `[워크큐증거] 잘못된 ID: ${token}`;
    if (!proofRaw) return '[워크큐증거] 증거 한 줄 필요';
    const proof = proofRaw.slice(0, 2000);
    const next = await appendAgentWorkQueueProofById(token, `slack:${proof}`);
    if (!next) return `[워크큐증거] 항목 없음: ${token}`;
    return `[워크큐증거] 기록 — \`${token}\` (refs ${Array.isArray(next.proof_refs) ? next.proof_refs.length : 0})`;
  }

  if (trimmed.startsWith('러너증거')) {
    const m = trimmed.match(/^러너증거\s+(\S+)(?:\s+([\s\S]+))?$/u);
    if (!m?.[1]) return '[러너증거] 형식: 러너증거 <run_id> <한 줄>';
    const rid = m[1];
    const proofRaw = (m[2] || '').trim();
    if (!proofRaw) return '[러너증거] 증거 한 줄 필요';
    const proof = proofRaw.slice(0, 2000);
    const next = await appendAgentWorkQueueProofByLinkedRun(rid, `slack:${proof}`);
    if (!next) {
      return `[러너증거] linked_run_id 가 \`${rid}\` 인 활성 AWQ 없음 (취소 제외)`;
    }
    return `[러너증거] 기록 — \`${next.id}\` ← run \`${rid}\``;
  }

  if (trimmed.startsWith('워크큐보류')) {
    const m = trimmed.match(/^워크큐보류\s+(\S+)(?:\s+([\s\S]+))?$/u);
    if (!m || !m[1]) return '[워크큐보류] 형식: 워크큐보류 <AWQ-…> <사유>';
    const token = m[1];
    const reason = (m[2] || '').trim() || '보류';
    if (!/^AWQ-/i.test(token)) return `[워크큐보류] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐보류] 항목 없음: ${token}`;
    if (prev.status === 'cancelled' || prev.status === 'done') {
      return `[워크큐보류] 현재 상태 \`${prev.status}\` — 갱신하지 않음: ${token}`;
    }
    const next = await patchAgentWorkQueueItem(token, { status: 'blocked', blocker: reason });
    if (!next) return `[워크큐보류] 갱신 실패: ${token}`;
    return `[워크큐보류] 완료 — \`${token}\` → \`blocked\` — ${reason.slice(0, 400)}`;
  }

  if (trimmed.startsWith('워크큐재개')) {
    const token = parseWorkToken(trimmed, '워크큐재개');
    if (!token) return '[워크큐재개] 형식: 워크큐재개 <AWQ-…>';
    if (!/^AWQ-/i.test(token)) return `[워크큐재개] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐재개] 항목 없음: ${token}`;
    if (prev.status !== 'blocked') {
      return `[워크큐재개] \`blocked\` 가 아님 (현재 \`${prev.status}\`): ${token}`;
    }
    const next = await patchAgentWorkQueueItem(token, { status: 'queued', blocker: null });
    if (!next) return `[워크큐재개] 갱신 실패: ${token}`;
    const w =
      next.linked_work_id ||
      (Array.isArray(next.linked_work_ids) && next.linked_work_ids.length
        ? String(next.linked_work_ids[0]).trim()
        : null);
    const tail = w
      ? `\n다음: \`커서발행 ${w}\` · …`
      : '\n다음: WRK 연결 후 발행';
    return `[워크큐재개] 완료 — \`${token}\` \`blocked\` → \`queued\`${tail}`;
  }

  if (trimmed.startsWith('워크큐착수')) {
    const token = parseWorkToken(trimmed, '워크큐착수');
    if (!token) return '[워크큐착수] 형식: 워크큐착수 <AWQ-…>';
    if (!/^AWQ-/i.test(token)) return `[워크큐착수] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐착수] 항목 없음: ${token}`;
    if (prev.status === 'pending_executive') {
      return `[워크큐착수] 먼저 \`워크큐실행허가 ${token}\` 로 \`queued\` 로 올리세요.`;
    }
    if (prev.status === 'blocked') {
      return `[워크큐착수] 먼저 \`워크큐재개 ${token}\` 로 \`queued\` 로 올리세요.`;
    }
    if (prev.status === 'cancelled' || prev.status === 'done') {
      return `[워크큐착수] 현재 상태 \`${prev.status}\` — 착수 불가: ${token}`;
    }
    if (prev.status !== 'queued') {
      return `[워크큐착수] \`queued\` 에서만 착수 (현재 \`${prev.status}\`): ${token}`;
    }
    const next = await patchAgentWorkQueueItem(token, { status: 'in_progress' });
    if (!next) return `[워크큐착수] 갱신 실패: ${token}`;
    return [
      `[워크큐착수] 완료 — \`${token}\` \`queued\` → \`in_progress\``,
      `다음: 핸드오프·발행 실행 후 \`워크큐완료 ${token}\` (+ 선택 증거 한 줄)`,
    ].join('\n');
  }

  if (trimmed.startsWith('워크큐완료')) {
    const m = trimmed.match(/^워크큐완료\s+(\S+)(?:\s+([\s\S]+))?$/u);
    if (!m || !m[1]) return '[워크큐완료] 형식: 워크큐완료 <AWQ-…> [증거·메모 한 줄]';
    const token = m[1];
    const proofRaw = (m[2] || '').trim();
    if (!/^AWQ-/i.test(token)) return `[워크큐완료] 잘못된 ID: ${token}`;
    const prev = await getAgentWorkQueueItem(token);
    if (!prev) return `[워크큐완료] 항목 없음: ${token}`;
    if (prev.status !== 'in_progress') {
      return `[워크큐완료] \`in_progress\` 에서만 완료 (현재 \`${prev.status}\`): ${token}`;
    }
    const proofSlice = proofRaw ? proofRaw.slice(0, 2000) : '';
    const patch =
      proofSlice.length > 0
        ? { status: 'done', proof_refs_append: [proofSlice] }
        : { status: 'done' };
    const next = await patchAgentWorkQueueItem(token, patch);
    if (!next) return `[워크큐완료] 갱신 실패: ${token}`;
    const proofLine = proofSlice ? `\n증거 기록: ${proofSlice.slice(0, 400)}${proofSlice.length > 400 ? '…' : ''}` : '';
    return `[워크큐완료] 완료 — \`${token}\` → \`done\`${proofLine}`;
  }

  if (trimmed === '환경프로필해제') {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 환경프로필을 해제할 수 없습니다. 채널에서 실행해주세요.';
    }
    await clearEnvironmentContext(metadata.channel);
    return '환경프로필을 해제했습니다. 이제 기본값(dev)을 사용합니다.';
  }

  if (trimmed === '배포준비점검') {
    const envProfile = await getEnvironmentProfile(envKey);
    const projectKey = projectContext || null;

    const resolvedRepo = projectKey ? await getRepoForProjectEnv(projectKey, envKey) : null;
    const resolvedDb = projectKey ? await getDbForProjectEnv(projectKey, envKey) : null;

    const envCheck = validateEnv();
    const automation = await getAutomationSettings();
    const store = getStoreCore();
    let supaConn = null;
    try {
      if (store.supabase_configured) supaConn = await store.checkSupabaseConnectivity('g1cos_work_items');
    } catch {
      supaConn = { ok: false, error: 'connectivity_check_failed' };
    }

    const blockers = [];
    if (RUNTIME_MODE !== 'hosted') blockers.push('현재 runtime_mode가 hosted가 아님');
    if (!envCheck.ok) blockers.push(`필수 env 누락: ${envCheck.missing.join(', ')}`);
    if (!automation.enabled_jobs || !automation.enabled_jobs.length) blockers.push('자동화 job이 현재 비활성화 상태');

    return [
      '배포준비점검',
      `- runtime mode: ${RUNTIME_MODE}`,
      `- project context: ${projectKey || '없음(기본 general)'}`,
      `- env profile: ${envKey} (${envProfile.display_name})`,
      `- repo mapping resolved: ${resolvedRepo || '없음(manual)'}`,
      `- db mapping resolved: ${resolvedDb || '없음(manual)'}`,
      `- storage mode: ${store.storage_mode}`,
      `- supabase configured: ${store.supabase_configured ? 'yes' : 'no'}`,
      `- supabase connectivity actual: ${supaConn?.ok ? 'pass' : 'fail'}${supaConn?.ok ? '' : ` (${supaConn?.error || 'error'})`}`,
      `- storage read preference: ${store.storage_read_preference}`,
      `- live dual-write collections: ${store.live_dual_write_collections?.length ? store.live_dual_write_collections.join(', ') : 'none'}`,
      `- storage migration readiness rough: ${store.supabase_configured ? 'ready' : 'not_ready'}`,
      `- 필수 env 존재: ${envCheck.ok ? '예' : '아니오'}${envCheck.ok ? '' : ` (${envCheck.missing.join(', ')})`}`,
      `- automation settings: enabled_jobs=${automation.enabled_jobs.join(', ') || '없음'}`,
      '',
      'hosted 전환 blocker 요약',
      blockers.length ? blockers.map((b) => `- ${b}`).join('\n') : '- 없음',
    ].join('\n');
  }

  if (trimmed === '저장소모드') {
    const store = getStoreCore();
    return [
      '저장소모드',
      `- STORAGE_MODE: ${store.storage_mode}`,
      `- supabase configured: ${store.supabase_configured ? 'yes' : 'no'}`,
      '',
      store.supabase_connectivity_text,
    ].join('\n');
  }

  if (trimmed === '저장소점검') {
    const store = getStoreCore();
    const core = store.live_dual_write_collections || [];
    let supaConn = null;
    try {
      if (store.supabase_configured) supaConn = await store.checkSupabaseConnectivity('g1cos_work_items');
    } catch {
      supaConn = { ok: false, error: 'connectivity_check_failed' };
    }

    const coreStats = await Promise.all(
      core.map(async (c) => {
        const jsonSum = await store.summarizeJson(c);
        let supSum = null;
        if (store.supabase_configured) {
          try {
            supSum = await store.summarizeSupabase(c);
          } catch (e) {
            supSum = { ok: false, error: String(e?.message || e) };
          }
        }
        return { c, jsonSum, supSum };
      })
    );

    let migrationPlan = null;
    try {
      migrationPlan = await buildMigrationPlan({ dryRun: true });
    } catch {
      migrationPlan = null;
    }

    return [
      '저장소점검',
      `- storage mode: ${store.storage_mode}`,
      `- supabase configured: ${store.supabase_configured ? 'yes' : 'no'}`,
      `- supabase connectivity actual: ${supaConn?.ok ? 'pass' : 'fail'}${supaConn?.ok ? '' : ` (${supaConn?.error || 'error'})`}`,
      `- storage read preference: ${store.storage_read_preference}`,
      `- live dual-write collections: ${core.length ? core.join(', ') : 'none'}`,
      '',
      store.supabase_connectivity_text,
      '',
      'core collection counts (JSON vs Supabase)',
      ...coreStats.map((s) => {
        const j = s.jsonSum || {};
        const r = s.supSum && s.supSum.ok === false ? null : s.supSum;
        const jt = j.total ?? 'n/a';
        const st = r ? r.total : 'n/a';
        const jMax = j.maxUpdatedAt || 'null';
        const sMax = r ? r.maxUpdatedAt || 'null' : 'n/a';
        return `- ${s.c}: json=${jt} (maxUpdatedAt=${jMax}) / supa=${st} (maxUpdatedAt=${sMax})`;
      }),
      '',
      migrationPlan
        ? `- migration dry-run: errors=${migrationPlan.errors.length}`
        : '- migration dry-run: 실패(읽기/파싱 문제 가능)',
    ].join('\n');
  }

  if (trimmed === '마이그레이션계획') {
    const plan = await buildMigrationPlan({ dryRun: true });
    return formatMigrationPlanForSlack(plan);
  }

  if (trimmed === '저장소요약') {
    const plan = await buildMigrationPlan({ dryRun: true });
    const store = getStoreCore();
    const core = store.live_dual_write_collections || [];

    const coreStats = await Promise.all(
      core.map(async (c) => {
        const jsonSum = await store.summarizeJson(c);
        let supSum = null;
        if (store.supabase_configured) {
          try {
            supSum = await store.summarizeSupabase(c);
          } catch {
            supSum = null;
          }
        }
        return { c, jsonSum, supSum };
      })
    );

    return [
      '저장소요약 (JSON + core Supabase counts)',
      `- total collections (JSON): ${plan.summary.totalCollections}`,
      `- total rows (JSON): ${plan.summary.totalRows}`,
      '',
      ...coreStats.map((s) => `- ${s.c}: json=${s.jsonSum.total} / supa=${s.supSum ? s.supSum.total : 'n/a'}`),
      ...(plan.errors.length ? ['','[errors]',...plan.errors.map((e)=>`- ${e.collection}: ${e.error}`)] : []),
    ].join('\n');
  }

  if (trimmed === '저장소비교' || trimmed.startsWith('저장소비교 ')) {
    const store = getStoreCore();
    const arg = trimmed === '저장소비교' ? null : trimmed.replace(/^저장소비교\s+/, '').trim();
    const core = store.live_dual_write_collections || [];
    const collections = arg ? [arg] : core;

    const validSet = new Set(core);
    if (arg && !validSet.has(arg)) {
      return `알 수 없는 collection. 가능한 값: ${core.join(', ')}`;
    }

    function samplePk(col) {
      if (col === 'work_runs') return 'run_id';
      return 'id';
    }

    const lines = ['저장소비교 (JSON vs Supabase)', `- storage mode: ${store.storage_mode}`, `- supabase configured: ${store.supabase_configured ? 'yes' : 'no'}`, `- storage read preference: ${store.storage_read_preference}`, ''];

    for (const c of collections) {
      const jsonSum = await store.summarizeJson(c);
      let supSum = null;
      if (store.supabase_configured) {
        try {
          supSum = await store.summarizeSupabase(c);
        } catch (e) {
          supSum = { ok: false, error: String(e?.message || e) };
        }
      }

      const jsonTotal = jsonSum.total ?? 'n/a';
      const supTotal = supSum && supSum.ok === false ? 'n/a' : supSum?.total ?? 'n/a';
      const jsonMax = jsonSum.maxUpdatedAt || 'null';
      const supMax = supSum && supSum.ok === false ? 'n/a' : supSum?.maxUpdatedAt || 'null';

      lines.push(`- ${c}: json=${jsonTotal} (maxUpdatedAt=${jsonMax}) / supa=${supTotal} (maxUpdatedAt=${supMax})`);

      // 최근 샘플 mismatch(가능한 범위: array collections)
      if (['approvals', 'work_items', 'work_runs'].includes(c) && store.supabase_configured) {
        const pk = samplePk(c);
        const orderBy = 'updated_at';
        let jsonSample = [];
        let supSample = [];
        try {
          jsonSample = await store.listJson(c, { _orderBy: orderBy, _orderDir: 'desc', _limit: 5 });
        } catch {
          jsonSample = [];
        }
        try {
          supSample = await store.listSupabase(c, { _orderBy: orderBy, _orderDir: 'desc', _limit: 5 });
        } catch {
          supSample = [];
        }

        const jIds = new Set((jsonSample || []).map((r) => String(r?.[pk] || '')).filter(Boolean));
        const sIds = new Set((supSample || []).map((r) => String(r?.[pk] || '')).filter(Boolean));

        const jOnly = [...jIds].filter((x) => !sIds.has(x)).slice(0, 5);
        const sOnly = [...sIds].filter((x) => !jIds.has(x)).slice(0, 5);

        if (jOnly.length || sOnly.length) {
          lines.push(`  - sample mismatch: json_only=[${jOnly.join(', ')}], supa_only=[${sOnly.join(', ')}]`);
        } else {
          lines.push('  - sample mismatch: none (latest window)');
        }
      }
    }

    return lines.join('\n');
  }

  if (trimmed === '연동프로필요약') {
    const envProfile = await getEnvironmentProfile(envKey);
    const projectKey = projectContext || 'shared_tools';

    const resolvedRepo = await getRepoForProjectEnv(projectKey, envKey);
    const resolvedDb = await getDbForProjectEnv(projectKey, envKey);

    const branchRule = envProfile.branch_prefix_rules || {};
    const recommendedNext = envProfile.risk_level === 'high' ? 'staging에서 QA 후 대표 승인 게이트 권장' : 'dev/staging에서 검증 후 hosted 전환 준비';

    return [
      '연동프로필요약',
      `- project/env: ${projectKey} / ${envKey}`,
      `- GitHub repo: ${resolvedRepo || '없음(manual)'}`,
      `- Supabase db: ${resolvedDb || '없음(manual)'}`,
      `- branch naming rule: bug=${branchRule.bug || 'fix'} / feature=${branchRule.feature || 'feat'} / refactor=${branchRule.refactor || 'refactor'} / ops=${branchRule.ops || 'chore'}`,
      `- risk level: ${envProfile.risk_level || 'unknown'}`,
      `- change policy: ${envProfile.change_policy || 'unknown'}`,
      `- 권장 next action: ${recommendedNext}`,
    ].join('\n');
  }

  if (trimmed === '자동화설정') {
    const settings = await getAutomationSettings();
    return formatAutomationSettings(settings);
  }

  if (trimmed.startsWith('자동화켜기 ')) {
    const job = trimmed.replace(/^자동화켜기\s+/, '').trim();
    const result = await setAutomationJobEnabled(job, true);
    if (!result.ok) return `알 수 없는 job_name 입니다. 가능한 값: ${JOB_NAMES.join(', ')}`;
    return `자동화켜기 완료: ${job}`;
  }

  if (trimmed.startsWith('자동화끄기 ')) {
    const job = trimmed.replace(/^자동화끄기\s+/, '').trim();
    const result = await setAutomationJobEnabled(job, false);
    if (!result.ok) return `알 수 없는 job_name 입니다. 가능한 값: ${JOB_NAMES.join(', ')}`;
    return `자동화끄기 완료: ${job}`;
  }

  if (trimmed === '아침브리프') {
    const result = await runAutomationJob('morning_brief', { source: metadata });
    return result.ok ? result.text : '아침브리프 실행에 실패했습니다.';
  }

  if (trimmed === '저녁정리') {
    const result = await runAutomationJob('evening_wrap', { source: metadata });
    return result.ok ? result.text : '저녁정리 실행에 실패했습니다.';
  }

  if (trimmed === '막힘업무요약') {
    const result = await runAutomationJob('blocked_work_digest', { source: metadata });
    return result.ok ? result.text : '막힘업무요약 실행에 실패했습니다.';
  }

  if (trimmed === '주간회고') {
    const result = await runAutomationJob('weekly_review', { source: metadata });
    return result.ok ? result.text : '주간회고 실행에 실패했습니다.';
  }

  const approvalAction = parseApprovalAction(trimmed);
  if (approvalAction) {
    const result = await updateApprovalStatus(
      approvalAction.approvalId,
      approvalAction.action,
      approvalAction.note,
      { approved_by: metadata.user, source: metadata }
    );
    if (result.ok && result.record?.approval_kind === 'planner' && result.record?.linked_plan_id) {
      const pid = result.record.linked_plan_id;
      try {
        if (result.record.status === 'approved') {
          const pr = await approvePlan(pid);
          if (!pr.ok && pr.reason !== 'rejected') {
            console.warn('[planner:apr_sync]', 'approvePlan', pid, pr.reason);
          }
        } else if (result.record.status === 'rejected') {
          const rj = await rejectPlan(pid, { reason: result.record.resolution_note || 'APR 폐기' });
          if (!rj.ok) console.warn('[planner:apr_sync]', 'rejectPlan', pid, rj.reason);
        } else if (result.record.status === 'on_hold') {
          const h = await appendPlanHoldNote(pid, result.record.resolution_note || '');
          if (!h.ok) console.warn('[planner:apr_sync]', 'hold note', pid, h.reason);
        }
      } catch (e) {
        console.warn('[planner:apr_sync]', 'fail', formatError(e));
      }
    }
    return formatApprovalUpdate(result);
  }

  if (trimmed.startsWith('승인대기요약')) {
    if (trimmed === '승인대기요약') {
      const result = await runAutomationJob('approval_digest', { source: metadata });
      if (result.ok) return result.text;
    }
    const count = parseRecentCount(trimmed);
    const approvals = await getPendingApprovals(count);
    return formatPendingApprovalsSummary(approvals);
  }

  if (trimmed.startsWith('승인대기')) {
    const count = parseRecentCount(trimmed);
    const approvals = await getPendingApprovals(count);
    return formatPendingApprovals(approvals);
  }

  if (trimmed.startsWith('주간브리프')) {
    const days = parseDays(trimmed, 7);
    return buildWeeklyBrief(days);
  }

  if (trimmed.startsWith('대표보고서')) {
    const days = parseDays(trimmed, 7);
    return buildExecutiveReport(days);
  }

  if (trimmed.startsWith('이번주핵심결정')) {
    const days = parseDays(trimmed, 7);
    return buildDecisionHighlights(days);
  }

  if (trimmed.startsWith('이번주핵심교훈')) {
    const days = parseDays(trimmed, 7);
    return buildLessonHighlights(days);
  }

  if (trimmed.startsWith('이번주리스크')) {
    const days = parseDays(trimmed, 7);
    return buildRiskHighlights(days);
  }

  if (trimmed === '현재채널설정') {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에는 채널 설정이 없습니다.';
    }
    return `현재 채널 설정: ${channelContext || '없음 (일반 모드)'}`;
  }

  if (trimmed === '현재프로젝트설정') {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에는 프로젝트 설정이 없습니다.';
    }
    return `현재 프로젝트 설정: ${projectContext || '없음 (shared_tools 기본값 사용)'}`;
  }

  if (trimmed === '프로젝트설정해제') {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 프로젝트 설정을 해제할 수 없습니다.';
    }
    await clearProjectContext(metadata.channel);
    return '프로젝트 설정을 해제했습니다. 이제 기본 프로젝트(shared_tools)를 사용합니다.';
  }

  if (trimmed === '채널설정해제') {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 채널 설정을 해제할 수 없습니다.';
    }
    await clearChannelContext(metadata.channel);
    return '채널 설정을 해제했습니다. 이제 이 채널은 일반 모드로 동작합니다.';
  }

  const desiredSetting = parseChannelSetting(trimmed);
  if (desiredSetting) {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 채널 설정을 할 수 없습니다. 채널 안에서 실행해주세요.';
    }
    if (!AGENT_OPTIONS.includes(desiredSetting)) {
      return `알 수 없는 채널 설정입니다. 가능한 값: ${AGENT_OPTIONS.join(', ')}`;
    }
    await setChannelContext(metadata.channel, desiredSetting);
    return `채널 설정 완료: ${desiredSetting}`;
  }

  const desiredProject = parseProjectSetting(trimmed);
  if (desiredProject) {
    if (!metadata.channel || metadata.source_type === 'direct_message') {
      return '직접 대화창에서는 프로젝트 설정을 할 수 없습니다. 채널 안에서 실행해주세요.';
    }
    if (!PROJECT_KEYS.includes(desiredProject)) {
      return `알 수 없는 프로젝트 키입니다. 가능한 값: ${PROJECT_KEYS.join(', ')}`;
    }
    await setProjectContext(metadata.channel, desiredProject);
    return `프로젝트 설정 완료: ${desiredProject}`;
  }

  if (trimmed === '현재저장소설정') {
    const projectKey = projectContext || 'shared_tools';
    const repoKey = await getRepoForProjectEnv(projectKey, envKey);
    return `현재 기본 저장소(${projectKey}): ${repoKey || '없음 (manual fallback)'}`;
  }

  if (trimmed === '저장소설정해제') {
    const projectKey = projectContext || 'shared_tools';
    await clearRepoForProject(projectKey);
    return `저장소 설정 해제 완료: ${projectKey} -> null`;
  }

  const repoSetting = parseRepoSetting(trimmed);
  if (repoSetting) {
    const projectKey = projectContext || 'shared_tools';
    await setRepoForProject(projectKey, repoSetting);
    return `저장소 설정 완료: ${projectKey} -> ${repoSetting}`;
  }

  if (trimmed === '현재데이터베이스설정') {
    const projectKey = projectContext || 'shared_tools';
    const dbKey = await getDbForProjectEnv(projectKey, envKey);
    return `현재 기본 데이터베이스(${projectKey}): ${dbKey || '없음 (manual fallback)'}`;
  }

  if (trimmed === '데이터베이스설정해제') {
    const projectKey = projectContext || 'shared_tools';
    await clearDbForProject(projectKey);
    return `데이터베이스 설정 해제 완료: ${projectKey} -> null`;
  }

  const dbSetting = parseDbSetting(trimmed);
  if (dbSetting) {
    const projectKey = projectContext || 'shared_tools';
    await setDbForProject(projectKey, dbSetting);
    return `데이터베이스 설정 완료: ${projectKey} -> ${dbSetting}`;
  }

  if (trimmed.startsWith('업무등록')) {
    const parsed = parseWorkRegisterText(trimmed);
    if (!parsed.brief) {
      return '업무등록 뒤에 실행할 내용을 함께 적어주세요.';
    }
    const projectKey = projectContext || 'shared_tools';
    const item = await createWorkItem({
      project_key: projectKey,
      tool_key: parsed.assigned_tool,
      work_type: parsed.work_type,
      owner_type: 'persona',
      assigned_persona: channelContext || 'general_cos',
      assigned_tool: parsed.assigned_tool,
      title: parsed.title,
      brief: parsed.brief,
      acceptance_criteria: parsed.acceptance_criteria,
      dependencies: parsed.dependencies,
      approval_required: parsed.approval_required,
      source: { ...metadata, command: '업무등록', priority: parsed.priority },
      source_channel: metadata.channel || null,
      source_message_ts: metadata.ts || null,
      notes: parsed.notes,
    });
    return [
      '업무 등록 완료',
      `- 업무 ID: ${item.id}`,
      `- 프로젝트: ${item.project_key}`,
      `- 상태: ${item.status} / 승인: ${item.approval_status}`,
      `- 담당 도구: ${item.assigned_tool}`,
      `- 제목: ${item.title}`,
    ].join('\n');
  }

  // ── Plan 관리 명령: 반드시 planner intake(계획등록 자연어)보다 먼저 — 공백 분리 입력·오매칭 시 Council 방지
  if (trimmed === '계획요약') {
    return formatPlansOverviewSlack({ count: 16 });
  }

  if (trimmed.startsWith('계획작업목록')) {
    const token = parseWorkToken(trimmed, '계획작업목록');
    if (!token) return '[계획작업목록] 형식: 계획작업목록 <plan_id|번호>';
    await listRecentPlansForAlias(40);
    const plan = await getPlan(token);
    return formatPlanWorkList(plan);
  }

  if (trimmed.startsWith('계획승인')) {
    const token = parseWorkToken(trimmed, '계획승인');
    if (!token) return '[계획승인] 형식: 계획승인 <plan_id|번호>';
    await listRecentPlansForAlias(40);
    const result = await approvePlan(token);
    if (!result.ok) {
      if (result.reason === 'not_found') return '[계획승인] plan을 찾지 못했습니다.';
      if (result.reason === 'rejected') return '[계획승인] 이미 기각된 계획입니다.';
      return `[계획승인] 처리 실패: ${result.reason}`;
    }
    const p = result.record;
    if (result.idempotent) {
      return ['[계획승인] 이미 승인된 계획입니다.', `- plan_id: ${p.plan_id}`, `- linked work: ${(p.linked_work_items || []).length}건`].join('\n');
    }
    return [
      '[계획승인] 완료',
      `- plan_id: ${p.plan_id}`,
      `- 연결 work를 draft→assigned 로 갱신했습니다(이미 assigned면 유지).`,
      '- 다음: 업무상세 → 수동 `커서발행` / `이슈발행` (자동 dispatch 없음)',
    ].join('\n');
  }

  if (trimmed.startsWith('계획기각')) {
    const parsed = parsePlanReject(trimmed);
    if (!parsed) return '[계획기각] 형식: 계획기각 <plan_id|번호> <사유(선택)>';
    await listRecentPlansForAlias(40);
    const result = await rejectPlan(parsed.planId, { reason: parsed.reason });
    if (!result.ok) {
      if (result.reason === 'not_found') return '[계획기각] plan을 찾지 못했습니다.';
      if (result.reason === 'already_approved') return '[계획기각] 이미 승인된 계획은 기각할 수 없습니다.';
      return `[계획기각] 처리 실패: ${result.reason}`;
    }
    const p = result.record;
    return [
      '[계획기각] 완료',
      `- plan_id: ${p.plan_id}`,
      parsed.reason ? `- 사유: ${parsed.reason}` : null,
      '- 연결 work(미종료)는 canceled 로 전환했습니다.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (trimmed.startsWith('계획발행')) {
    const token = parseWorkToken(trimmed, '계획발행');
    if (!token) return '[계획발행] 형식: 계획발행 <plan_id|번호>';
    await listRecentPlansForAlias(40);
    const res = await bridgePlanToDispatch(token);
    if (!res.ok) {
      console.info('[planner:bridge]', 'blocked', res.reason, res.plan?.plan_id);
      return res.message || `[계획발행] 실패: ${res.reason || 'unknown'}`;
    }
    console.info('[planner:bridge]', 'ok', res.plan.plan_id, res.plan.status);
    return res.message;
  }

  if (trimmed.startsWith('계획시작')) {
    const token = parseWorkToken(trimmed, '계획시작');
    if (!token) return '[계획시작] 형식: 계획시작 <plan_id|번호>';
    await listRecentPlansForAlias(40);
    const r = await markPlanInProgress(token);
    if (!r.ok) {
      if (r.reason === 'not_found') return '[계획시작] plan을 찾지 못했습니다.';
      return `[계획시작] 전이 불가 (${r.reason}) status=${r.plan?.status}`;
    }
    if (r.idempotent) return ['[계획시작] 이미 in_progress 입니다.', `- plan_id: ${r.record.plan_id}`].join('\n');
    return ['[계획시작] 완료', `- plan_id: ${r.record.plan_id}`, '- plan status: in_progress'].join('\n');
  }

  if (trimmed.startsWith('계획완료')) {
    const token = parseWorkToken(trimmed, '계획완료');
    if (!token) return '[계획완료] 형식: 계획완료 <plan_id|번호>';
    await listRecentPlansForAlias(40);
    const r = await markPlanDone(token);
    if (!r.ok) {
      if (r.reason === 'not_found') return '[계획완료] plan을 찾지 못했습니다.';
      if (r.reason === 'rejected') return '[계획완료] 기각된 계획은 완료 처리할 수 없습니다.';
      if (r.reason === 'works_incomplete') {
        const lines = [
          '[계획완료] 거부 — child work가 모두 done이 아닙니다.',
          `- plan_id: ${r.plan.plan_id}`,
          '- 미완료:',
          ...(r.incomplete || []).map((x) => `  - ${x.id} | status: ${x.status}`),
        ];
        return lines.join('\n');
      }
      return `[계획완료] 실패: ${r.reason}`;
    }
    if (r.idempotent) return ['[계획완료] 이미 done 입니다.', `- plan_id: ${r.record.plan_id}`].join('\n');
    return ['[계획완료] 표시 완료', `- plan_id: ${r.record.plan_id}`, '- status: done (신규 dispatch는 plan_gate에서 차단)'].join('\n');
  }

  if (trimmed.startsWith('계획차단')) {
    const parsed = parsePlanBlockCmd(trimmed);
    if (!parsed) return '[계획차단] 형식: 계획차단 <plan_id|번호> <사유>';
    await listRecentPlansForAlias(40);
    const r = await markPlanBlocked(parsed.planId, parsed.reason);
    if (!r.ok) {
      if (r.reason === 'not_found') return '[계획차단] plan을 찾지 못했습니다.';
      if (r.reason === 'already_done') return '[계획차단] 이미 done 인 계획은 차단하지 않습니다.';
      return `[계획차단] 실패: ${r.reason}`;
    }
    if (r.idempotent) {
      return ['[계획차단] 이미 blocked 상태입니다.', `- plan_id: ${r.record.plan_id}`].join('\n');
    }
    return ['[계획차단] 완료', `- plan_id: ${r.record.plan_id}`, `- 사유: ${parsed.reason}`].join('\n');
  }

  if (trimmed.startsWith('계획변경')) {
    const m = trimmed.match(/^계획변경\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (!m) return '[계획변경] 형식: 계획변경 <plan_id|번호> <메모(선택)>';
    await listRecentPlansForAlias(40);
    const plan = await getPlan(m[1]);
    if (!plan) return '[계획변경] plan을 찾지 못했습니다.';
    const memo = (m[2] || '').trim();
    return [
      '[계획변경] (스코프 안내)',
      `- plan_id: ${plan.plan_id}`,
      memo ? `- 요청 메모(비저장): ${memo.slice(0, 400)}` : null,
      '- 저장소에 plan 본문 편집 API는 아직 없습니다. 범위 변경은 새 `계획등록` 또는 연결 `업무수정요청 <WRK>`를 권장합니다.',
      `- 현재 상태 확인: \`계획상세 ${plan.plan_id}\``,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (trimmed.startsWith('업무대기')) {
    const count = parseRecentCount(trimmed);
    const records = await listWorkItems({ count, projectKey: projectContext || null, openOnly: true });
    return formatWorkItemList(records);
  }

  if (trimmed.startsWith('업무승인')) {
    const token = parseWorkToken(trimmed, '업무승인');
    if (!token) return '업무승인 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'approved', { note: `승인자: ${metadata.user || 'unknown'}` });
    return formatWorkUpdate(result, '업무승인');
  }

  if (trimmed.startsWith('업무보류')) {
    const token = parseWorkToken(trimmed, '업무보류');
    if (!token) return '업무보류 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'pending_approval', { note: '보류 처리' });
    return formatWorkUpdate(result, '업무보류');
  }

  if (trimmed.startsWith('업무취소')) {
    const token = parseWorkToken(trimmed, '업무취소');
    if (!token) return '업무취소 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'canceled', { note: '취소 처리' });
    return formatWorkUpdate(result, '업무취소');
  }

  if (trimmed.startsWith('업무완료')) {
    const token = parseWorkToken(trimmed, '업무완료');
    if (!token) return '업무완료 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'done', { note: '완료 처리' });
    return formatWorkUpdate(result, '업무완료');
  }

  if (trimmed.startsWith('업무실패')) {
    const token = parseWorkToken(trimmed, '업무실패');
    if (!token) return '업무실패 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'blocked', { note: '실패/블로킹 처리' });
    return formatWorkUpdate(result, '업무실패');
  }

  if (trimmed.startsWith('업무배정')) {
    const parsed = parseWorkAssign(trimmed);
    if (!parsed) return '형식: 업무배정 <work_id|번호> <persona_or_tool>';
    const result = await assignWorkItem(parsed.workId, parsed.assignee);
    return formatWorkUpdate(result, '업무배정');
  }

  if (trimmed.startsWith('업무요약')) {
    const match = trimmed.match(/^업무요약\s+([a-z_]+)\s*$/);
    const projectKey = match?.[1] || projectContext || null;
    if (projectKey && !PROJECT_KEYS.includes(projectKey)) {
      return `알 수 없는 프로젝트 키입니다. 가능한 값: ${PROJECT_KEYS.join(', ')}`;
    }
    const records = await listWorkItems({ count: 200, projectKey, openOnly: false });
    return summarizeWorkItems(records, { projectKey });
  }

  if (trimmed === '깃허브점검') {
    try {
      const pre = await runGithubPrecheck();
      console.info('[github:precheck]', pre.overall, pre.auth_mode, pre.target || 'no-target');
      return formatGithubPrecheckForSlack(pre);
    } catch (e) {
      console.warn('[github:precheck]', 'internal_fail', formatError(e));
      return `깃허브점검 내부 오류: ${formatError(e)}`;
    }
  }

  if (trimmed.startsWith('이슈발행') || trimmed.startsWith('깃허브발행')) {
    const cmd = trimmed.startsWith('이슈발행') ? '이슈발행' : '깃허브발행';
    const token = parseWorkToken(trimmed, cmd);
    if (!token) return `${cmd} 뒤에 업무 ID 또는 번호를 적어주세요.`;
    let item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const planGateGh = await getPlanGateMessageForWorkItem(item);
    if (planGateGh) return planGateGh;

    if (!isGithubAuthConfigured()) {
      console.info('[github:auth]', 'fail', 'none');
      return formatGithubIssueCommandError(new Error('github_auth_missing')).userMessage;
    }
    console.info('[github:auth]', 'ok', getGithubAuthMode());

    const defaultRepo = await getRepoForProjectEnv(item.project_key, envKey);
    const resolvedRepo = item.repo_key || defaultRepo || null;
    const repoTarget = resolveGitHubRepoTarget({ repoKey: resolvedRepo });
    if (!repoTarget) {
      console.info('[github:repo_resolve]', 'fail', item.project_key, resolvedRepo || '');
      return [
        '[repo_resolve 실패] 대상 GitHub repo를 resolve하지 못했습니다.',
        `- work_id: ${item.id}`,
        `- project_key: ${item.project_key}`,
        `- resolved repo key: ${resolvedRepo || '없음'}`,
        '- 해결: `GITHUB_DEFAULT_OWNER` / `GITHUB_DEFAULT_REPO` 또는 repo registry에 owner/repo',
      ].join('\n');
    }
    console.info('[github:repo_resolve]', 'ok', `${repoTarget.owner}/${repoTarget.repo}`);

    if (item.assigned_tool !== 'github') {
      const assign = await assignWorkItem(item.id, 'github', { note: `${cmd}: 도구를 github으로 설정` });
      if (assign.ok) item = assign.record;
    }

    const issuePayload = prepareGithubDispatch({
      ...item,
      github_kind: 'issue',
      repo_key: `${repoTarget.owner}/${repoTarget.repo}`,
    });

    // run을 먼저 남긴다 (실제 external artifact loop closure 추적)
    const { runSeed } = createAdapterRunPayload(
      { ...item, github_kind: 'issue', repo_key: `${repoTarget.owner}/${repoTarget.repo}` },
      { user: metadata.user, note: 'GitHub issue thin slice 발행' }
    );

    const run = await createWorkRun({
      work_id: item.id,
      project_key: item.project_key,
      tool_key: 'github',
      adapter_type: runSeed.adapter_type,
      dispatch_payload: issuePayload,
      dispatch_target: `github:${repoTarget.owner}/${repoTarget.repo}`,
      executor_type: 'github',
      executor_session_label: runSeed.executor_session_label || null,
      repo_key: `${repoTarget.owner}/${repoTarget.repo}`,
      branch_name: null,
      issue_key: null,
      pr_key: null,
      github_status: 'dispatched',
      github_payload_kind: 'issue',
      created_by: runSeed.created_by,
      notes: runSeed.notes,
    });

    await updateRunStatus(run.run_id, 'running', {
      qa_checklist: generateQaChecklist(item.work_type),
      note: 'GitHub issue 생성 시도',
    });

    try {
      console.info('[github:issue_create]', 'start', item.id, run.run_id);
      const issueResult = await createIssueArtifact({
        workItem: item,
        repoTarget,
        metadata: {
          user: metadata.user || null,
          channel: metadata.channel || null,
          runId: run.run_id,
        },
      });

      const artifact = issueResult.artifact;
      console.info(
        '[github:issue_create]',
        issueResult.duplicate ? 'duplicate' : 'created',
        artifact.issue_number
      );
      const existingArtifacts = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
      const mergedArtifacts = (() => {
        if (issueResult.duplicate) {
          return existingArtifacts.map((a) => {
            if (
              a?.provider === 'github' &&
              a?.artifact_type === 'issue' &&
              a.repo_owner === repoTarget.owner &&
              a.repo_name === repoTarget.repo &&
              Number(a.issue_number) === Number(artifact.issue_number)
            ) {
              return { ...a, ...artifact };
            }
            return a;
          });
        }
        return [...existingArtifacts, artifact];
      })();

      try {
        await updateWorkItemGithubFields(item.id, {
          repo_key: `${repoTarget.owner}/${repoTarget.repo}`,
          github_kind: 'issue',
          issue_title: issuePayload.title || null,
          github_artifacts: mergedArtifacts,
          github_artifact: artifact,
        });

        await updateRunStatus(run.run_id, 'done', {
          github_status: issueResult.duplicate ? 'linked_existing' : 'opened',
          issue_key: artifact.issue_number ? `#${artifact.issue_number}` : null,
          result_link: artifact.issue_url,
          github_issue_artifact: artifact,
          result_summary: issueResult.duplicate
            ? `기존 issue 재사용: ${artifact.issue_url}`
            : `issue 생성 완료: ${artifact.issue_url}`,
          result_status: 'approved',
          qa_status: 'passed',
          note: issueResult.duplicate ? 'duplicate guard: 기존 issue 링크 반환' : 'issue 생성 성공',
        });

        await updateWorkStatus(item.id, 'dispatched', {
          note: issueResult.duplicate
            ? `GitHub issue 기존 링크 사용: ${artifact.issue_url}`
            : `GitHub issue 생성: ${artifact.issue_url}`,
        });
        console.info('[github:persist]', 'ok', item.id, run.run_id);
      } catch (persistErr) {
        console.warn('[github:persist]', 'fail', item.id, formatError(persistErr));
        await updateRunStatus(run.run_id, 'blocked', {
          github_status: 'persist_failed',
          error_summary: formatError(persistErr),
          qa_status: 'failed',
          result_link: artifact.issue_url,
          github_issue_artifact: artifact,
          note: 'artifact persistence 실패',
        });
        await updateWorkStatus(item.id, 'blocked', {
          note: `[${cmd}] 저장 실패(${run.run_id}): ${formatError(persistErr)} / issue URL: ${artifact.issue_url}`,
        });
        return formatGithubIssuePersistFailedLines({
          cmd,
          workId: item.id,
          runId: run.run_id,
          artifact,
          duplicate: issueResult.duplicate,
          persistErr,
        });
      }

      let awqGhTail = '';
      let awqGhId = null;
      try {
        const awqRow = await linkAgentWorkQueueRunForWork(item.id, run.run_id);
        awqGhId =
          awqRow && typeof awqRow === 'object' && /** @type {any} */ (awqRow).id != null
            ? String(/** @type {any} */ (awqRow).id)
            : null;
        awqGhTail = formatAwqRunLinkTail(run.run_id, awqRow);
      } catch {
        /* ignore */
      }
      fireAgentBridgeNotify({
        event: 'tool_dispatch',
        tool: 'github',
        version: 1,
        work_id: item.id,
        run_id: run.run_id,
        project_key: item.project_key,
        env_key: envKey,
        title: item.title,
        brief: item.brief,
        awq_id: awqGhId,
        slack: slackSourceForBridge(metadata),
        github: {
          issue_url: artifact.issue_url,
          issue_number: artifact.issue_number,
          owner: repoTarget.owner,
          repo: repoTarget.repo,
        },
        issue_payload: safeJsonSlice(issuePayload, 16_000),
      });
      return (
        formatGithubIssuePublishSuccessLines({
          cmd,
          runId: run.run_id,
          workId: item.id,
          repoTarget,
          artifact,
          duplicate: issueResult.duplicate,
          persistenceStatus: 'ok',
        }) + awqGhTail
      );
    } catch (error) {
      const { category, userMessage } = formatGithubIssueCommandError(error);
      console.warn('[github:issue_create]', 'fail', category, item.id);
      await updateRunStatus(run.run_id, 'failed', {
        github_status: 'failed',
        error_summary: formatError(error),
        qa_status: 'failed',
        note: `GitHub issue API 실패 (${category})`,
      });
      await updateWorkStatus(item.id, 'blocked', {
        note: `GitHub issue 생성 실패(${run.run_id}): ${formatError(error)}`,
      });

      return [
        `${cmd} 실패 [${category}]`,
        `- work_id: ${item.id}`,
        `- run_id: ${run.run_id}`,
        `- repo: ${repoTarget.owner}/${repoTarget.repo}`,
        userMessage,
      ].join('\n');
    }
  }

  if (trimmed.startsWith('깃허브상세')) {
    const token = parseWorkToken(trimmed, '깃허브상세');
    if (!token) return '깃허브상세 뒤에 work_id 또는 run_id 또는 번호를 적어주세요.';

    if (!isGithubAuthConfigured()) {
      return formatGithubIssueCommandError(new Error('github_auth_missing')).userMessage;
    }

    const run = await getWorkRun(token);
    const item = run ? await getWorkItem(run.work_id) : await getWorkItem(token);
    if (!item) return '해당 work/run을 찾지 못했습니다.';

    const artifacts = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
    const issueArtifact =
      artifacts.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue') ||
      item.github_artifact ||
      null;

    if (!issueArtifact) {
      return [
        '깃허브상세',
        `- work_id: ${item.id}`,
        '- 연결된 GitHub issue artifact가 없습니다.',
      ].join('\n');
    }

    let liveStatus = null;
    let syncFailCategory = null;
    try {
      liveStatus = await getIssueStatus({
        owner: issueArtifact.repo_owner,
        repo: issueArtifact.repo_name,
        issue_number: issueArtifact.issue_number,
      });
      console.info('[github:sync]', 'ok', item.id, issueArtifact.issue_number);
    } catch (syncErr) {
      syncFailCategory = formatGithubIssueCommandError(syncErr).category;
      console.warn('[github:sync]', 'fail', syncFailCategory, 'work_id=', item.id);
    }

    if (liveStatus) {
      const updatedArt = {
        ...issueArtifact,
        state: liveStatus.state,
        updated_at: liveStatus.updated_at,
        issue_url: liveStatus.html_url || issueArtifact.issue_url,
        sync_status: 'synced',
      };
      const baseArts = artifacts.length ? [...artifacts] : issueArtifact ? [issueArtifact] : [];
      const nextArts = baseArts.map((a) => {
        if (
          a?.provider === 'github' &&
          a?.artifact_type === 'issue' &&
          a.repo_owner === updatedArt.repo_owner &&
          a.repo_name === updatedArt.repo_name &&
          Number(a.issue_number) === Number(updatedArt.issue_number)
        ) {
          return updatedArt;
        }
        return a;
      });
      await updateWorkItemGithubFields(item.id, {
        repo_key: `${updatedArt.repo_owner}/${updatedArt.repo_name}`,
        github_artifacts: nextArts,
        github_artifact: updatedArt,
      });
    } else {
      await updateWorkItemGithubFields(item.id, {
        repo_key: `${issueArtifact.repo_owner}/${issueArtifact.repo_name}`,
      });
    }

    const cached = liveStatus
      ? {
          ...issueArtifact,
          state: liveStatus.state,
          updated_at: liveStatus.updated_at,
          issue_url: liveStatus.html_url || issueArtifact.issue_url,
        }
      : issueArtifact;

    const lines = [
      '깃허브상세',
      '',
      '─ 동작 규칙 ─',
      '- 이 명령은 GitHub API로 **live issue**를 조회해, 성공 시 `work_item`의 artifact를 **refresh 저장**합니다.',
      '- live 조회가 실패하면 **로컬에 저장된 artifact는 변경하지 않습니다**(아래에 sync 실패만 표시).',
      '',
      `- work_id: ${item.id}`,
      `- repo: ${issueArtifact.repo_owner}/${issueArtifact.repo_name}`,
      `- issue_number: #${issueArtifact.issue_number}`,
      `- issue_url: ${cached.issue_url}`,
      `- state: ${cached.state || 'unknown'}`,
      `- updated_at: ${cached.updated_at || '없음'}`,
      `- stored_sync_status (artifact): ${issueArtifact.sync_status || 'unknown'}`,
      `- live_refresh: ${liveStatus ? '성공 → work_item artifact 갱신됨(synced)' : '실패 → artifact 디스크/DB 미변경'}`,
    ];
    if (!liveStatus && syncFailCategory) {
      lines.push(`- live_sync 오류 분류: ${syncFailCategory} (auth / github_api / 네트워크 등)`);
    } else if (!liveStatus) {
      lines.push('- live_sync: 실패(원인 미분류 — 인증·네트워크·권한 확인)');
    }
    return lines.join('\n');
  }

  if (trimmed.startsWith('이슈초안')) {
    const token = parseWorkToken(trimmed, '이슈초안');
    if (!token) return '이슈초안 뒤에 업무 ID 또는 번호를 적어주세요.';
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const defaultRepo = await getRepoForProjectEnv(item.project_key, envKey);
    const resolvedRepo = item.repo_key || defaultRepo || null;

    const issuePayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'issue' });
    const branchPayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'branch' });
    const prPayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'pr' });

    await updateWorkItemGithubFields(item.id, {
      repo_key: resolvedRepo,
      github_kind: 'issue',
      branch_name: branchPayload.suggested_branch_name || null,
      issue_title: issuePayload.title || null,
      pr_title: prPayload.pr_title || null,
    });

    return ['이슈초안(페이로드)', JSON.stringify(issuePayload, null, 2)].join('\n');
  }

  if (trimmed.startsWith('브랜치초안')) {
    const token = parseWorkToken(trimmed, '브랜치초안');
    if (!token) return '브랜치초안 뒤에 업무 ID 또는 번호를 적어주세요.';
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const defaultRepo = await getRepoForProjectEnv(item.project_key, envKey);
    const resolvedRepo = item.repo_key || defaultRepo || null;

    const branchPayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'branch' });
    const issuePayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'issue' });
    const prPayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'pr' });

    await updateWorkItemGithubFields(item.id, {
      repo_key: resolvedRepo,
      github_kind: 'branch',
      branch_name: branchPayload.suggested_branch_name || null,
      issue_title: issuePayload.title || null,
      pr_title: prPayload.pr_title || null,
    });

    return ['브랜치초안(페이로드)', JSON.stringify(branchPayload, null, 2)].join('\n');
  }

  if (trimmed.startsWith('PR초안')) {
    const token = parseWorkToken(trimmed, 'PR초안');
    if (!token) return 'PR초안 뒤에 run_id 또는 work_id를 적어주세요.';

    const run = await getWorkRun(token);
    const item = run ? await getWorkItem(run.work_id) : await getWorkItem(token);
    if (!item) return '해당 업무/work 또는 실행(run)을 찾지 못했습니다.';

    const defaultRepo = await getRepoForProjectEnv(item.project_key, envKey);
    const resolvedRepo = item.repo_key || defaultRepo || null;

    const prPayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'pr' });
    const issuePayload = prepareGithubDispatch({ ...item, repo_key: resolvedRepo, github_kind: 'issue' });

    await updateWorkItemGithubFields(item.id, {
      repo_key: resolvedRepo,
      github_kind: 'pr',
      branch_name: prPayload.branch || null,
      issue_title: issuePayload.title || null,
      pr_title: prPayload.pr_title || null,
    });

    return ['PR초안(템플릿 페이로드)', JSON.stringify(prPayload, null, 2)].join('\n');
  }

  if (trimmed.startsWith('PR검토')) {
    const token = parseWorkToken(trimmed, 'PR검토');
    if (!token) return 'PR검토 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    const blockers = run.blockers || [];
    const unresolved = run.unresolved_risks || [];
    const testsPassed = run.tests_passed;
    const handoffUpdated = run.handoff_updated;
    const biggestObjection = blockers[0] || unresolved[0] || '명확한 반대 논리 없음';

    let merge_readiness = 'unknown';
    let reason = '';
    if (blockers.length) {
      merge_readiness = 'not_ready';
      reason = `blockers 존재: ${blockers[0]}`;
    } else if (testsPassed === false) {
      merge_readiness = 'not_ready';
      reason = '테스트 실패가 확인됨';
    } else if (unresolved.length) {
      merge_readiness = 'not_ready';
      reason = `남은 리스크: ${unresolved[0]}`;
    } else if (handoffUpdated === false) {
      merge_readiness = 'not_ready';
      reason = 'handoff/doc 업데이트 미반영';
    } else if (testsPassed === true) {
      merge_readiness = 'ready';
      reason = '테스트 및 리스크 신호가 충족됨';
    } else {
      merge_readiness = 'unknown';
      reason = '테스트/리스크 정보가 충분히 명확하지 않음';
    }

    const conclusion = merge_readiness === 'ready' ? '머지 준비됨' : merge_readiness === 'not_ready' ? '머지 보류 필요' : '판정 보류(정보 부족)';
    const nextAction = merge_readiness === 'ready'
      ? '대표 확인 후 머지판정'
      : '블로커/리스크를 해결한 뒤 결과재등록 후 PR검토 재요청';

    const review_summary = [
      `결론: ${conclusion}`,
      `merge_readiness: ${merge_readiness}`,
      `가장 큰 반대: ${biggestObjection}`,
      `남은 blocker: ${(blockers || []).length ? blockers.join(' | ') : '없음'}`,
      `사유: ${reason}`,
    ].join('\n');

    await updateRunStatus(run.run_id, 'review', {
      review_summary,
      merge_readiness,
      github_status: 'in_review',
      note: `PR검토: ${reason}`,
    });

    return [
      'PR검토 결과',
      `- 결론: ${conclusion}`,
      `- merge readiness: ${merge_readiness}`,
      `- 가장 큰 반대 논리: ${biggestObjection}`,
      `- 남은 blocker: ${(blockers || []).length ? blockers.join(', ') : '없음'}`,
      `- 다음 액션: ${nextAction}`,
    ].join('\n');
  }

  if (trimmed.startsWith('머지판정')) {
    const token = parseWorkToken(trimmed, '머지판정');
    if (!token) return '머지판정 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    // PR검토와 동일한 heuristic을 사용하되, 최종 판정/이유를 더 명확히 저장한다.
    const blockers = run.blockers || [];
    const unresolved = run.unresolved_risks || [];
    const testsPassed = run.tests_passed;
    const handoffUpdated = run.handoff_updated;
    const biggestObjection = blockers[0] || unresolved[0] || '명확한 반대 논리 없음';

    let merge_readiness = 'unknown';
    let reason = '';
    if (blockers.length) {
      merge_readiness = 'not_ready';
      reason = `blockers 존재: ${blockers[0]}`;
    } else if (testsPassed === false) {
      merge_readiness = 'not_ready';
      reason = '테스트 실패';
    } else if (unresolved.length) {
      merge_readiness = 'not_ready';
      reason = `리스크 남음: ${unresolved[0]}`;
    } else if (handoffUpdated === false) {
      merge_readiness = 'not_ready';
      reason = 'handoff/doc 미반영';
    } else if (testsPassed === true) {
      merge_readiness = 'ready';
      reason = '테스트 통과 + 리스크 완화 신호';
    } else {
      merge_readiness = 'unknown';
      reason = '판정에 필요한 정보 부족';
    }

    await updateRunStatus(run.run_id, 'review', {
      merge_readiness,
      github_status: merge_readiness === 'ready' ? 'opened' : 'rejected',
      note: `머지판정: ${reason}`,
    });

    return [
      '머지판정 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 결론: ${merge_readiness === 'ready' ? '머지 준비됨' : '머지 보류 필요'}`,
      `- merge readiness: ${merge_readiness}`,
      `- 가장 큰 반대 논리: ${biggestObjection}`,
      `- 남은 blocker: ${(blockers || []).length ? blockers.join(', ') : '없음'}`,
      `- 이유: ${reason}`,
      `- 다음 액션: ${merge_readiness === 'ready' ? '대표 확인 후 머지 진행' : 'blocker/리스크 해소 후 PR검토 재요청'}`,
    ].join('\n');
  }

  if (trimmed.startsWith('머지준비')) {
    const token = parseWorkToken(trimmed, '머지준비');
    if (!token) return '머지준비 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    await updateRunStatus(run.run_id, 'review', {
      merge_readiness: 'ready',
      github_status: 'opened',
      note: '머지준비: ready',
    });

    return [
      '머지준비 완료',
      `- 실행 ID: ${run.run_id}`,
      '- merge readiness: ready',
      '- 다음 액션: 대표 확인 후 머지판정/머지 진행',
    ].join('\n');
  }

  if (trimmed.startsWith('머지보류')) {
    const parsed = parseGithubMergeReject(trimmed);
    if (!parsed) return '머지보류 뒤에 run_id 또는 번호와 사유를 적어주세요.';
    const run = await getWorkRun(parsed.runId);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    await updateRunStatus(run.run_id, 'blocked', {
      merge_readiness: 'not_ready',
      github_status: 'rejected',
      note: `머지보류: ${parsed.reason}`,
      error_summary: parsed.reason,
    });

    return [
      '머지보류 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 사유: ${parsed.reason}`,
      '- merge readiness: not_ready',
    ].join('\n');
  }

  // Supabase Bridge v1 (payload + run + review/rollback gates)
  if (trimmed.startsWith('수파베이스발행')) {
    const token = parseWorkToken(trimmed, '수파베이스발행');
    if (!token) return '수파베이스발행 뒤에 업무 ID 또는 번호를 적어주세요.';
    let item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const planGateSb = await getPlanGateMessageForWorkItem(item);
    if (planGateSb) return planGateSb;

    const defaultDb = await getDbForProjectEnv(item.project_key, envKey);
    const resolvedDbScope = item.db_scope || defaultDb || null;

    if (!resolvedDbScope) {
      // db_scope가 없으면 payload/db 검토가 어렵기 때문에 manual fallback로 명시
      await updateWorkItemSupabaseFields(item.id, { db_scope: 'manual' });
      item = await getWorkItem(item.id);
    } else if (!item.db_scope) {
      await updateWorkItemSupabaseFields(item.id, { db_scope: resolvedDbScope });
      item = await getWorkItem(item.id);
    }

    if (item.assigned_tool !== 'supabase') {
      const assign = await assignWorkItem(item.id, 'supabase', { note: '수파베이스발행: 도구를 supabase로 설정' });
      if (assign.ok) item = assign.record;
    }

    // run 생성 + payload preview
    const { runSeed } = createAdapterRunPayload(item, { user: metadata.user });
    const run = await createWorkRun({
      work_id: item.id,
      project_key: item.project_key,
      tool_key: runSeed.tool_key,
      adapter_type: runSeed.adapter_type,
      dispatch_payload: runSeed.dispatch_payload,
      dispatch_target: runSeed.dispatch_target,
      executor_type: runSeed.executor_type,
      executor_session_label: runSeed.executor_session_label || null,
      db_scope: runSeed.db_scope || resolvedDbScope,
      migration_name: runSeed.migration_name || null,
      function_name: runSeed.function_name || null,
      supabase_payload_kind: runSeed.supabase_payload_kind || null,
      supabase_status: runSeed.supabase_status || 'drafted',
      sql_preview: runSeed.sql_preview || '',
      verification_summary: runSeed.verification_summary || '',
      rollback_readiness: runSeed.rollback_readiness || 'unknown',
      affected_objects: runSeed.affected_objects || [],
      created_by: runSeed.created_by,
      notes: runSeed.notes,
    });

    // 발행 즉시 최소 assigned/in_progress 전환
    if (item.status === 'assigned') {
      await updateWorkStatus(item.id, 'in_progress', { note: `run 진행 시작: ${run.run_id}` });
      await updateRunStatus(run.run_id, 'running', { note: '수파베이스발행 시 running 전환' });
    } else if (item.status !== 'in_progress') {
      await updateWorkStatus(item.id, 'assigned', { note: `run 생성: ${run.run_id}` });
    }

    const qa = [
      '변경 범위가 명확한가',
      'destructive change 여부가 명확한가',
      'verification query(들)가 충분한가',
      'rollback 방법이 명확한가',
      'RLS/권한 리스크가 명시되었는가',
      'blocker가 명확한가',
      'handoff/doc 업데이트가 필요한가',
    ];
    await updateRunStatus(run.run_id, run.status, { qa_checklist: qa });

    let awqSbTail = '';
    let awqSbId = null;
    try {
      const awqRow = await linkAgentWorkQueueRunForWork(item.id, run.run_id);
      awqSbId =
        awqRow && typeof awqRow === 'object' && /** @type {any} */ (awqRow).id != null
          ? String(/** @type {any} */ (awqRow).id)
          : null;
      awqSbTail = formatAwqRunLinkTail(run.run_id, awqRow);
    } catch {
      /* ignore */
    }

    fireAgentBridgeNotify({
      event: 'tool_dispatch',
      tool: 'supabase',
      version: 1,
      work_id: item.id,
      run_id: run.run_id,
      project_key: item.project_key,
      env_key: envKey,
      title: item.title,
      brief: item.brief,
      awq_id: awqSbId,
      slack: slackSourceForBridge(metadata),
      db_scope: run.db_scope || null,
      dispatch_payload: safeJsonSlice(run.dispatch_payload, 24_000),
      sql_preview: safeJsonSlice(run.sql_preview || '', 8000),
      supabase_payload_kind: run.supabase_payload_kind || null,
    });

    return [
      '수파베이스발행 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 업무 ID: ${run.work_id}`,
      `- 프로젝트: ${run.project_key}`,
      `- DB scope: ${run.db_scope || '없음'}`,
      `- 현재 상태: ${run.status}`,
      '',
      formatRunDispatchForSlack(run.tool_key, run),
    ].join('\n') + awqSbTail;
  }

  // Draft-only: kind별 supabase payload 생성(실행/런 생성 없음)
  const supabaseDraftKindMap = {
    '마이그레이션초안': 'migration',
    '정책초안': 'policy',
    '함수초안': 'function',
    '데이터수정초안': 'data_fix',
    '저장소규칙초안': 'storage',
  };
  const draftKey = Object.keys(supabaseDraftKindMap).find((k) => trimmed.startsWith(k));
  if (draftKey) {
    const kind = supabaseDraftKindMap[draftKey];
    const prefix = draftKey;
    const token = parseWorkToken(trimmed, prefix);
    if (!token) return `${prefix} 뒤에 업무 ID 또는 번호를 적어주세요.`;
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const defaultDb = await getDbForProjectEnv(item.project_key, envKey);
    const resolvedDbScope = item.db_scope || defaultDb || null;
    const temp = {
      ...item,
      db_scope: resolvedDbScope || item.db_scope || null,
      supabase_kind: kind,
    };

    const payload = prepareSupabaseDispatch(temp);
    return [`${draftKey}(페이로드)`, JSON.stringify(payload, null, 2)].join('\n');
  }

  if (trimmed.startsWith('DB검토')) {
    const token = parseWorkToken(trimmed, 'DB검토');
    if (!token) return 'DB검토 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';
    const work = await getWorkItem(run.work_id);

    let rollback_readiness = run.rollback_readiness;
    if (!rollback_readiness || rollback_readiness === 'unknown') {
      const blocked = (run.blockers || []).length > 0;
      const unresolved = (run.unresolved_risks || []).length > 0;
      const hasVerification =
        Boolean(run.verification_summary && run.verification_summary.trim()) ||
        Boolean(run.sql_preview && run.sql_preview.trim());
      if (blocked || unresolved) rollback_readiness = 'not_ready';
      else if (hasVerification) rollback_readiness = 'ready';
      else rollback_readiness = 'unknown';
    }

    const biggestObjection = (run.blockers || [])[0] || (run.unresolved_risks || [])[0] || run.error_summary || '명확한 반대 논리 없음';
    const remainingBlocker = (run.blockers || []).length ? (run.blockers || []).join(' | ') : '없음';
    const nextAction =
      rollback_readiness === 'ready'
        ? '롤백판정 또는 롤백준비로 진행'
        : 'rollback blocker/리스크를 제거한 뒤 결과재등록';

    const checklist = [
      '변경 범위가 명확한가',
      'destructive change 여부가 명확한가',
      'verification query가 충분한가',
      'rollback 방법이 명확한가',
      'RLS/권한 리스크가 명시되었는가',
      'blocker가 명확한가',
      'handoff/doc 업데이트가 필요한가',
    ];

    const conclusion = rollback_readiness === 'ready' ? '롤백 가능(권장)' : '롤백 보류 필요';

    const review_summary = [
      `결론: ${conclusion}`,
      `rollback readiness: ${rollback_readiness}`,
      `가장 큰 반대 논리: ${biggestObjection}`,
      `남은 blocker: ${remainingBlocker}`,
    ].join('\n');

    await updateRunStatus(run.run_id, 'review', {
      rollback_readiness,
      supabase_status: rollback_readiness === 'ready' ? 'verified' : 'rejected',
      review_summary,
      qa_checklist: checklist,
      qa_status: 'pending',
      note: `DB검토: ${conclusion}`,
    });

    return [
      'DB검토 결과',
      `- 한 줄 결론: ${conclusion}`,
      `- rollback readiness: ${rollback_readiness}`,
      `- 가장 큰 반대 논리: ${biggestObjection}`,
      `- 남은 blocker: ${remainingBlocker}`,
      `- 다음 액션: ${nextAction}`,
    ].join('\n');
  }

  if (trimmed.startsWith('롤백준비')) {
    const token = parseWorkToken(trimmed, '롤백준비');
    if (!token) return '롤백준비 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';
    await updateRunStatus(run.run_id, 'review', {
      rollback_readiness: 'ready',
      supabase_status: 'verified',
      qa_status: 'pending',
      note: '롤백준비: ready',
    });
    return [
      '롤백준비 완료',
      `- 실행 ID: ${run.run_id}`,
      '- rollback readiness: ready',
      '- 다음 액션: 롤백판정 실행',
    ].join('\n');
  }

  if (trimmed.startsWith('롤백판정')) {
    const token = parseWorkToken(trimmed, '롤백판정');
    if (!token) return '롤백판정 뒤에 run_id 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    const computed = (() => {
      const blocked = (run.blockers || []).length > 0;
      const unresolved = (run.unresolved_risks || []).length > 0;
      if (run.rollback_readiness === 'ready' && !blocked && !unresolved) return 'ready';
      if (blocked || unresolved) return 'not_ready';
      return run.rollback_readiness || 'unknown';
    })();

    const biggestObjection = (run.blockers || [])[0] || (run.unresolved_risks || [])[0] || run.error_summary || '명확한 반대 논리 없음';
    const reason = computed === 'ready' ? '블로커/리스크가 충분히 해소됨' : `rollback blocker: ${biggestObjection}`;

    await updateRunStatus(run.run_id, 'review', {
      rollback_readiness: computed === 'ready' ? 'ready' : 'not_ready',
      supabase_status: computed === 'ready' ? 'rolled_back' : 'rejected',
      qa_status: computed === 'ready' ? 'passed' : 'failed',
      note: `롤백판정: ${reason}`,
    });

    return [
      '롤백판정 완료',
      `- 실행 ID: ${run.run_id}`,
      `- rollback readiness: ${computed === 'ready' ? 'ready' : 'not_ready'}`,
      `- 가장 큰 반대 논리: ${biggestObjection}`,
      `- 남은 blocker: ${biggestObjection}`,
      `- 다음 액션: ${computed === 'ready' ? '롤백 수행 단계로 진행' : 'rollback 준비 보완 후 재검토'}`,
    ].join('\n');
  }

  if (trimmed.startsWith('롤백보류')) {
    const parsed = parseRollbackReject(trimmed);
    if (!parsed) return '롤백보류 뒤에 run_id 또는 번호와 사유를 적어주세요.';
    const run = await getWorkRun(parsed.runId);
    if (!run) return '해당 실행(run)을 찾지 못했습니다.';

    await updateRunStatus(run.run_id, 'blocked', {
      rollback_readiness: 'not_ready',
      supabase_status: 'rejected',
      error_summary: parsed.reason,
      note: `롤백보류: ${parsed.reason}`,
      qa_status: 'failed',
    });
    await updateWorkStatus(run.work_id, 'blocked', { note: `롤백보류(${run.run_id}): ${parsed.reason}` });

    return [
      '롤백보류 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 사유: ${parsed.reason}`,
      '- rollback readiness: not_ready',
      '- 다음 액션: 롤백 준비 조건을 보완한 뒤 결과재등록/롤백판정 재시도',
    ].join('\n');
  }

  if (trimmed.startsWith('커서발행')) {
    const token = parseWorkToken(trimmed, '커서발행');
    if (!token) return '[커서발행] 형식: 커서발행 <work_id|번호>';
    const item = await getWorkItem(token);
    if (!item) return '[커서발행] work item 없음: 해당 업무 ID를 찾지 못했습니다.';

    const planGateCr = await getPlanGateMessageForWorkItem(item);
    if (planGateCr) return planGateCr;

    if (item.assigned_tool !== 'cursor') {
      await assignWorkItem(item.id, 'cursor', { note: '커서발행 명령으로 도구를 cursor로 변경' });
      item.assigned_tool = 'cursor';
      item.owner_type = 'tool';
    }

    const githubIssue = extractGithubIssueFromWorkItem(item);
    const warnings = [];
    if (!githubIssue) {
      warnings.push('[경고] GitHub issue 없음: handoff에 placeholder만 포함됩니다. (필수 아님)');
    }

    const effectiveProject = projectContext || item.project_key || 'shared_tools';
    const envProfile = await getEnvironmentProfile(envKey);
    let resolvedRepoHint = item.repo_key || null;
    if (!resolvedRepoHint) {
      try {
        resolvedRepoHint = await getRepoForProjectEnv(effectiveProject, envKey);
      } catch {
        resolvedRepoHint = null;
      }
    }

    const cursorItem = { ...item, assigned_tool: 'cursor' };
    const { runSeed } = createAdapterRunPayload(cursorItem, { user: metadata.user });
    const run = await createWorkRun({
      work_id: cursorItem.id,
      project_key: cursorItem.project_key,
      tool_key: 'cursor',
      adapter_type: runSeed.adapter_type,
      dispatch_payload: '',
      dispatch_target: '',
      executor_type: 'cursor',
      executor_session_label: runSeed.executor_session_label || null,
      created_by: runSeed.created_by,
      notes: [runSeed.notes, '[cursor:dispatch] handoff 발행'].filter(Boolean).join(' | ').trim(),
    });

    let markdown;
    let fileMeta;
    try {
      markdown = buildCursorHandoffMarkdown(cursorItem, {
        envKey,
        envDisplayName: envProfile?.display_name || null,
        channelId: metadata.channel || null,
        githubIssue,
        resolvedRepoHint,
        planId: cursorItem.source_plan_id || null,
        workspaceQueueId: cursorItem.source_workspace_queue_id || null,
      });
      fileMeta = await writeCursorHandoffFile({
        workId: cursorItem.id,
        runId: run.run_id,
        markdown,
      });
      console.info('[cursor:handoff_write]', 'ok', cursorItem.id, run.run_id, fileMeta.handoff_path);
    } catch (handoffErr) {
      console.warn('[cursor:handoff_write]', 'fail', cursorItem.id, formatError(handoffErr));
      await updateRunStatus(run.run_id, 'failed', {
        error_summary: formatError(handoffErr),
        qa_status: 'failed',
        note: '[커서발행] handoff 파일 쓰기 실패',
      });
      return ['[커서발행] handoff 생성 실패:', `- ${formatError(handoffErr)}`, `- run_id: ${run.run_id}`].join('\n');
    }

    const linkedGh = githubIssue
      ? {
          repo_owner: githubIssue.repo_owner,
          repo_name: githubIssue.repo_name,
          issue_number: githubIssue.issue_number,
          issue_url: githubIssue.issue_url,
          state: githubIssue.state || null,
        }
      : null;

    const artifact = buildCursorHandoffArtifact({
      work_id: cursorItem.id,
      run_id: run.run_id,
      handoff_path: fileMeta.handoff_path,
      handoff_title: fileMeta.handoff_title,
      linked_github_issue: linkedGh,
      dispatch_status: 'cursor_in_progress',
    });

    try {
      const existingArts = Array.isArray(item.cursor_artifacts) ? item.cursor_artifacts : [];
      const nextArts = [...existingArts, artifact];
      await updateWorkItemCursorFields(cursorItem.id, {
        cursor_handoff_artifact: artifact,
        cursor_artifacts: nextArts,
      });
      await updateRunStatus(run.run_id, 'running', {
        dispatch_payload: markdown,
        dispatch_target: fileMeta.handoff_path,
        cursor_handoff_artifact: artifact,
        qa_checklist: generateQaChecklist(item.work_type),
        note: '[cursor:persist] ok',
      });
      console.info('[cursor:persist]', 'ok', cursorItem.id, run.run_id);
    } catch (persistErr) {
      console.warn('[cursor:persist]', 'fail', cursorItem.id, formatError(persistErr));
      await updateRunStatus(run.run_id, 'failed', {
        error_summary: formatError(persistErr),
        qa_status: 'failed',
        cursor_handoff_artifact: artifact,
        dispatch_payload: markdown,
        dispatch_target: fileMeta.handoff_path,
        note: '[커서발행] persistence 실패 (work_item/work_run 저장)',
      });
      return [
        '[커서발행] persistence 실패:',
        `- ${formatError(persistErr)}`,
        `- run_id: ${run.run_id}`,
        `- handoff 파일은 생성됨: ${fileMeta.handoff_path}`,
      ].join('\n');
    }

    await updateWorkStatus(item.id, 'dispatched', { note: `커서발행(handoff): ${run.run_id}` });

    let awqRunLinkLine = '';
    let linkedAwqId = null;
    try {
      const awqRow = await linkAgentWorkQueueRunForWork(item.id, run.run_id);
      linkedAwqId =
        awqRow && typeof awqRow === 'object' && /** @type {any} */ (awqRow).id != null
          ? String(/** @type {any} */ (awqRow).id)
          : null;
      awqRunLinkLine = formatAwqRunLinkTail(run.run_id, awqRow);
    } catch {
      /* 워크큐 파일 없음 등 — 커서발행 성공은 유지 */
    }

    const mdBridge = handoffMarkdownForBridge(markdown);
    fireAgentBridgeNotify({
      event: 'tool_dispatch',
      tool: 'cursor',
      version: 1,
      work_id: item.id,
      run_id: run.run_id,
      project_key: run.project_key,
      env_key: envKey,
      title: item.title,
      brief: item.brief,
      handoff_path: fileMeta.handoff_path,
      handoff_markdown: mdBridge.text,
      handoff_markdown_truncated: mdBridge.truncated,
      linked_plan_id: item.source_plan_id || null,
      source_workspace_queue_id: item.source_workspace_queue_id || null,
      repo_hint: resolvedRepoHint,
      awq_id: linkedAwqId,
      slack: slackSourceForBridge(metadata),
      github_issue: linkedGh,
    });

    const refreshed = await getWorkRun(run.run_id);
    const lines = [
      '[커서발행] 완료',
      ...warnings,
      `- 실행 ID: ${run.run_id}`,
      `- 업무 ID: ${run.work_id}`,
      `- handoff 경로: ${fileMeta.handoff_path}`,
      `- dispatch_status: ${artifact.dispatch_status}`,
      `- 프로젝트: ${run.project_key} / env: ${envKey}`,
    ];
    if (awqRunLinkLine) lines.push(awqRunLinkLine.trim());
    lines.push('', formatRunDispatchForSlack('cursor', refreshed || run));
    return lines.join('\n');
  }

  if (trimmed.startsWith('커서상세')) {
    const token = parseWorkToken(trimmed, '커서상세');
    if (!token) return '[커서상세] 형식: 커서상세 <work_id|run_id|번호>';
    let run = await getWorkRun(token);
    if (run && run.tool_key !== 'cursor') {
      run = await getLatestCursorRunForWork(run.work_id);
    }
    if (!run) {
      const item = await getWorkItem(token);
      if (item) run = await getLatestCursorRunForWork(item.id);
    }
    if (!run) return '[커서상세] 해당 work/run에 cursor 실행 기록이 없습니다.';
    if (run.tool_key !== 'cursor') return '[커서상세] 최신 실행이 cursor 도구가 아닙니다.';
    const art = run.cursor_handoff_artifact;
    const lines = formatCursorHandoffSummaryLines(art, { header: '── Cursor handoff (실행 연결) ──' });
    return [
      '[커서상세]',
      `- run_id: ${run.run_id}`,
      `- work_id: ${run.work_id}`,
      `- run 상태: ${run.status}`,
      `- 실행 notes: ${run.notes || '없음'}`,
      ...(lines.length ? ['', ...lines] : ['', '- handoff artifact: (없음)']),
    ].join('\n');
  }

  if (trimmed.startsWith('커서결과기록')) {
    const parsed = parseCursorResultRecord(trimmed);
    if (!parsed) return '[커서결과기록] 형식: 커서결과기록 <work_id|run_id|번호> <한 줄 요약>';
    const { run, via, workId, wrongRun } = await resolveCursorRunFromToken(parsed.idToken);
    if (!run) {
      if (via === 'wrong_tool' && wrongRun) {
        return `[커서결과기록] cursor 실행(run)이 아닙니다. (찾은 run: ${wrongRun.run_id}, tool: ${wrongRun.tool_key})`;
      }
      if (via === 'work_id' && workId) {
        return '[커서결과기록] 해당 업무에 cursor dispatch(work_run) 기록이 없습니다.';
      }
      return '[커서결과기록] work/run을 찾지 못했습니다.';
    }

    const inferred = inferCursorIngestResultStatus(parsed.summary);
    const prevArt = run.cursor_handoff_artifact;
    const baseArt =
      prevArt && prevArt.provider === 'cursor' && prevArt.artifact_type === 'handoff'
        ? prevArt
        : buildCursorHandoffArtifact({
            work_id: run.work_id,
            run_id: run.run_id,
            handoff_path: run.dispatch_target || '(unknown)',
            handoff_title: 'handoff (기존 artifact 없음)',
            linked_github_issue: null,
            dispatch_status: 'unknown',
          });
    const mergedArt = mergeCursorHandoffResult(baseArt, { summary: parsed.summary, inferredStatus: inferred });

    const qaFromInferred =
      inferred === 'failed' ? 'failed' : inferred === 'patch_complete' ? 'passed' : 'pending';
    const nextRunStatus =
      inferred === 'failed' ? 'failed' : inferred === 'needs_followup' ? 'running' : 'review';

    try {
      await updateRunStatus(run.run_id, nextRunStatus, {
        cursor_handoff_artifact: mergedArt,
        result_summary: parsed.summary,
        result_status: inferred === 'patch_complete' ? 'submitted' : inferred === 'failed' ? 'failed' : 'needs_followup',
        qa_status: qaFromInferred,
        note: `[커서결과기록] ${inferred}: ${parsed.summary.slice(0, 200)}`,
      });

      const item = await getWorkItem(run.work_id);
      if (item) {
        const arts = Array.isArray(item.cursor_artifacts) ? [...item.cursor_artifacts] : [];
        const idx = arts.findIndex((a) => a?.run_id === run.run_id && a?.provider === 'cursor');
        if (idx >= 0) arts[idx] = mergedArt;
        else arts.push(mergedArt);
        const latestCursor = await getLatestCursorRunForWork(run.work_id);
        const isLatestCursorRun = latestCursor && latestCursor.run_id === run.run_id;
        await updateWorkItemCursorFields(run.work_id, {
          cursor_artifacts: arts,
          ...(isLatestCursorRun ? { cursor_handoff_artifact: mergedArt } : {}),
        });
      }

      if (inferred === 'patch_complete' || inferred === 'unknown') {
        await updateWorkStatus(run.work_id, 'review_requested', {
          note: `커서결과기록(review_requested/${inferred}): ${run.run_id}`,
        });
      } else if (inferred === 'failed') {
        await updateWorkStatus(run.work_id, 'blocked', { note: `커서결과기록(failed): ${run.run_id}` });
      } else if (inferred === 'needs_followup') {
        await updateWorkStatus(run.work_id, 'in_progress', { note: `커서결과기록(후속): ${run.run_id}` });
      }
      console.info('[cursor:ingest]', 'ok', run.run_id, inferred);
    } catch (ingestErr) {
      console.warn('[cursor:ingest]', 'fail', run.run_id, formatError(ingestErr));
      return ['[커서결과기록] ingest 실패:', `- ${formatError(ingestErr)}`].join('\n');
    }

    let awqProofRow = null;
    /** @type {'run'|'work'|null} */
    let awqProofVia = null;
    const proofLine = `cursor_result:${run.run_id}:${inferred}`;
    try {
      awqProofRow = await appendAgentWorkQueueProofByLinkedRun(run.run_id, proofLine);
      if (awqProofRow?.id) awqProofVia = 'run';
      if (!awqProofRow && run.work_id) {
        awqProofRow = await appendAgentWorkQueueProofByLinkedWork(run.work_id, proofLine, {
          preferRunId: run.run_id,
        });
        if (awqProofRow?.id) awqProofVia = 'work';
      }
    } catch (awqErr) {
      console.warn('[cursor:ingest]', 'awq_proof_skip', run.run_id, formatError(awqErr));
    }

    const outLines = [
      '[커서결과기록] 반영 완료',
      `- run_id: ${run.run_id}`,
      `- work_id: ${run.work_id}`,
      `- 추론 결과 상태: ${inferred}`,
      `- qa_status: ${qaFromInferred} / run_status: ${nextRunStatus}`,
      `- 요약: ${parsed.summary}`,
    ];
    if (awqProofRow && awqProofRow.id) {
      const via =
        awqProofVia === 'work'
          ? 'WRK 연결 행( run 미연결·폴백 가능 )'
          : '`linked_run_id` 일치 행';
      outLines.push(`- 에이전트 워크큐 \`${awqProofRow.id}\`에 증거 \`cursor_result:…\` 추가 — ${via}`);
    }
    return outLines.join('\n');
  }

  if (trimmed.startsWith('업무발행')) {
    const token = parseWorkToken(trimmed, '업무발행');
    if (!token) return '업무발행 뒤에 업무 ID 또는 번호를 적어주세요.';
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const planGateUb = await getPlanGateMessageForWorkItem(item);
    if (planGateUb) return planGateUb;

    const { runSeed } = createAdapterRunPayload(item, { user: metadata.user });
    const run = await createWorkRun({
      work_id: item.id,
      project_key: item.project_key,
      tool_key: runSeed.tool_key,
      adapter_type: runSeed.adapter_type,
      dispatch_payload: runSeed.dispatch_payload,
      dispatch_target: runSeed.dispatch_target,
      executor_type: runSeed.executor_type || runSeed.tool_key,
      executor_session_label: runSeed.executor_session_label || null,
      created_by: runSeed.created_by,
      notes: runSeed.notes,
    });
    await updateRunStatus(run.run_id, run.status, {
      qa_checklist: generateQaChecklist(item.work_type),
    });

    if (item.status === 'assigned') {
      await updateWorkStatus(item.id, 'in_progress', { note: `run 진행 시작: ${run.run_id}` });
      await updateRunStatus(run.run_id, 'running', { note: '업무발행 시 running 전환' });
    } else if (item.status !== 'in_progress') {
      await updateWorkStatus(item.id, 'assigned', { note: `run 생성: ${run.run_id}` });
    }

    return [
      '업무발행 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 업무 ID: ${run.work_id}`,
      `- 프로젝트: ${run.project_key}`,
      `- 도구: ${run.tool_key}`,
      `- 현재 상태: ${run.status}`,
      '',
      formatRunDispatchForSlack(run.tool_key, run),
    ].join('\n');
  }

  if (trimmed === '실행대기') {
    const runs = await listWorkRuns({ status: 'dispatched', count: 20 });
    return formatRunList(runs, '실행 대기 목록');
  }

  if (trimmed === '실행중') {
    const runs = await listWorkRuns({ status: 'running', count: 20 });
    return formatRunList(runs, '실행중 목록');
  }

  if (trimmed === '실행실패') {
    const runs = await listWorkRuns({ status: 'failed', count: 20 });
    return formatRunList(runs, '실행실패 목록');
  }

  if (trimmed.startsWith('실행상세')) {
    const token = parseWorkToken(trimmed, '실행상세');
    if (!token) return '실행상세 뒤에 실행 ID 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    return formatRunDetail(run);
  }

  if (trimmed.startsWith('결과등록')) {
    const parsed = parseResultRegister(trimmed);
    if (!parsed) return '형식: 결과등록 <run_id|번호>: <자유 텍스트>';
    const run = await getWorkRun(parsed.runId);
    if (!run) return '해당 실행 ID를 찾지 못했습니다.';

    // adapter parser 우선 + 공통 parser 병합은 workRuns.submitRunResult에서 처리됨
    const adapterParsed = parseResultIntakeByTool(run.tool_key, parsed.resultText);
    const result = await submitRunResult(run.run_id, parsed.resultText, { reviewer: metadata.user || null });
    if (!result.ok) return '결과등록 처리에 실패했습니다.';
    if (adapterParsed) {
      await updateRunStatus(run.run_id, result.record.status, {
        ...adapterParsed,
        result_status: 'submitted',
      });

      // GitHub result intake에서 추출된 메타를 work item에도 반영한다.
      const patch = {};
      if (adapterParsed.branch_name) patch.branch_name = adapterParsed.branch_name;
      if (adapterParsed.issue_title) patch.issue_title = adapterParsed.issue_title;
      if (adapterParsed.pr_title) patch.pr_title = adapterParsed.pr_title;

      if (run.github_payload_kind) {
        if (run.github_payload_kind === 'issue') patch.github_kind = 'issue';
        else if (run.github_payload_kind === 'pr') patch.github_kind = 'pr';
        else if (run.github_payload_kind === 'issue+pr') patch.github_kind = 'mixed';
      }

      if (Object.keys(patch).length) {
        await updateWorkItemGithubFields(run.work_id, patch);
      }

      // Supabase result intake에서 추출된 메타를 work item에도 반영한다.
      const supPatch = {};
      if (adapterParsed.migration_name) supPatch.migration_name = adapterParsed.migration_name;
      if (adapterParsed.function_name) supPatch.function_name = adapterParsed.function_name;
      const effectiveKind = adapterParsed.supabase_payload_kind || run.supabase_payload_kind;
      if (effectiveKind && effectiveKind !== 'mixed') {
        supPatch.supabase_kind = effectiveKind;
      }
      if (adapterParsed.affected_objects && Array.isArray(adapterParsed.affected_objects) && adapterParsed.affected_objects.length) {
        if (effectiveKind === 'policy') supPatch.policy_targets = adapterParsed.affected_objects;
        else if (effectiveKind === 'storage') supPatch.storage_targets = adapterParsed.affected_objects;
        else supPatch.table_targets = adapterParsed.affected_objects;
      }
      if (Object.keys(supPatch).length) {
        await updateWorkItemSupabaseFields(run.work_id, supPatch);
      }
    }
    await updateWorkStatus(run.work_id, 'review_requested', { note: `결과등록(review_requested): ${run.run_id}` });
    return [
      '결과 등록 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 상태: review / result_status=submitted`,
      `- 변경 파일 수: ${result.record.changed_files?.length || 0}`,
      `- 테스트 통과: ${
        result.record.tests_passed === null ? '미기재' : result.record.tests_passed ? '예' : '아니오'
      }`,
    ].join('\n');
  }

  if (trimmed.startsWith('결과검토')) {
    const token = parseWorkToken(trimmed, '결과검토');
    if (!token) return '결과검토 뒤에 실행 ID 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행 ID를 찾지 못했습니다.';
    return `${formatReviewForSlack(run.tool_key, run)}\n\n${reviewRunResult(run)}`;
  }

  if (trimmed.startsWith('결과승인')) {
    const token = parseWorkToken(trimmed, '결과승인');
    if (!token) return '결과승인 뒤에 실행 ID 또는 번호를 적어주세요.';
    const run = await getWorkRun(token);
    if (!run) return '해당 실행 ID를 찾지 못했습니다.';
    const result = await approveRunResult(run.run_id, { reviewer: metadata.user || null });
    if (!result.ok) return '결과승인 처리에 실패했습니다.';
    await updateWorkStatus(run.work_id, 'done', { note: `결과승인: ${run.run_id}` });
    return [
      '결과 승인 완료',
      `- 실행 ID: ${run.run_id}`,
      `- run 상태: ${result.record.status} / qa_status: ${result.record.qa_status}`,
      `- 업무 상태: done`,
    ].join('\n');
  }

  if (trimmed.startsWith('결과반려')) {
    const parsed = parseResultReject(trimmed);
    if (!parsed) return '형식: 결과반려 <run_id|번호> <사유>';
    const run = await getWorkRun(parsed.runId);
    if (!run) return '해당 실행 ID를 찾지 못했습니다.';
    const result = await rejectRunResult(run.run_id, parsed.reason, { reviewer: metadata.user || null });
    if (!result.ok) return '결과반려 처리에 실패했습니다.';
    await updateWorkStatus(run.work_id, 'in_progress', { note: `결과반려(${run.run_id}): ${parsed.reason}` });
    return [
      '결과 반려 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 사유: ${parsed.reason}`,
      `- run 상태: ${result.record.status} / result_status: ${result.record.result_status}`,
      `- 업무 상태: in_progress`,
    ].join('\n');
  }

  if (trimmed.startsWith('막힘등록')) {
    const parsed = parseBlockedRun(trimmed);
    if (!parsed) return '형식: 막힘등록 <run_id|번호> <사유>';
    const run = await getWorkRun(parsed.runId);
    if (!run) return '해당 실행 ID를 찾지 못했습니다.';
    const result = await markRunBlocked(run.run_id, parsed.reason);
    if (!result.ok) return '막힘등록 처리에 실패했습니다.';
    await updateWorkStatus(run.work_id, 'blocked', { note: `막힘등록(${run.run_id}): ${parsed.reason}` });
    return [
      '막힘 등록 완료',
      `- 실행 ID: ${run.run_id}`,
      `- 사유: ${parsed.reason}`,
      `- run 상태: ${result.record.status}`,
      `- 업무 상태: blocked`,
    ].join('\n');
  }

  if (trimmed.startsWith('업무진행')) {
    const token = parseWorkToken(trimmed, '업무진행');
    if (!token) return '업무진행 뒤에 업무 ID 또는 번호를 적어주세요.';
    const result = await updateWorkStatus(token, 'in_progress', { note: '업무진행 명령 처리' });
    if (result.ok) {
      const latestRun = await getLatestRunByWorkId(result.record.id);
      if (latestRun && latestRun.status === 'dispatched') {
        await updateRunStatus(latestRun.run_id, 'running', { note: '업무진행과 동기화' });
      }
    }
    return formatWorkUpdate(result, '업무진행');
  }

  if (trimmed.startsWith('업무수정요청')) {
    const parsed = parseWorkRevisionRequest(trimmed);
    if (!parsed) return '형식: 업무수정요청 <work_id|번호> <사유(한 줄 이상)>';
    const item = await getWorkItem(parsed.workId);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';
    const noteLine = `업무수정요청: ${parsed.reason}`;
    const result = await updateWorkStatus(parsed.workId, 'needs_revision', { note: noteLine });
    return formatWorkUpdate(result, '업무수정요청');
  }

  if (trimmed.startsWith('업무차단')) {
    const parsed = parseWorkBlock(trimmed);
    if (!parsed) return '형식: 업무차단 <work_id|번호> <사유>';
    const result = await updateWorkStatus(parsed.workId, 'blocked', { note: `차단 사유: ${parsed.reason}` });
    if (result.ok) {
      const latestRun = await getLatestRunByWorkId(result.record.id);
      if (latestRun) {
        await updateRunStatus(latestRun.run_id, 'blocked', {
          error_summary: parsed.reason,
          note: '업무차단과 동기화',
        });
      }
    }
    return formatWorkUpdate(result, '업무차단');
  }

  if (trimmed.startsWith('업무재개')) {
    const token = parseWorkToken(trimmed, '업무재개');
    if (!token) return '업무재개 뒤에 업무 ID 또는 번호를 적어주세요.';
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';
    const nextStatus = item.approval_required && item.approval_status !== 'approved' ? 'assigned' : 'in_progress';
    const result = await updateWorkStatus(item.id, nextStatus, { note: '업무재개 처리' });
    return formatWorkUpdate(result, '업무재개');
  }

  if (trimmed.startsWith('업무재발행')) {
    const token = parseWorkToken(trimmed, '업무재발행');
    if (!token) return '업무재발행 뒤에 업무 ID 또는 번호를 적어주세요.';
    const item = await getWorkItem(token);
    if (!item) return '해당 업무 ID를 찾지 못했습니다.';

    const prevRun = await getLatestRunByWorkId(item.id);
    if (!prevRun) return '재발행할 기존 실행(run)이 없습니다. 먼저 업무발행을 수행하세요.';

    const { runSeed } = createAdapterRunPayload(item, { user: metadata.user, note: `retry from ${prevRun.run_id}` });
    const newRun = await retryRun(prevRun, {
      dispatch_payload: runSeed.dispatch_payload,
      created_by: metadata.user || null,
      notes: `재발행: ${prevRun.run_id}`,
    });

    await updateWorkStatus(item.id, 'assigned', { note: `재발행 run 생성: ${newRun.run_id}` });
    return [
      '업무 재발행 완료',
      `- 이전 실행: ${prevRun.run_id}`,
      `- 새 실행: ${newRun.run_id}`,
      `- retry_count: ${newRun.retry_count}`,
      '',
      formatRunDispatchForSlack(newRun.tool_key, newRun),
    ].join('\n');
  }

  if (trimmed.startsWith('결정기록:')) {
    const raw = trimmed.replace(/^결정기록:\s*/, '').trim();
    if (!raw) {
      return '결정기록 뒤에 내용을 함께 적어주세요.';
    }

    const structured = await parseDecisionRecord(raw);
    const record = {
      id: makeId('DEC'),
      created_at: new Date().toISOString(),
      ...structured,
      source: metadata,
      channel_context: channelContext,
    };

    await appendJsonRecord(DECISIONS_FILE, record);
    return formatDecisionSaved(record);
  }

  if (trimmed.startsWith('교훈기록:')) {
    const raw = trimmed.replace(/^교훈기록:\s*/, '').trim();
    if (!raw) {
      return '교훈기록 뒤에 내용을 함께 적어주세요.';
    }

    const structured = await parseLessonRecord(raw);
    const record = {
      id: makeId('LES'),
      created_at: new Date().toISOString(),
      ...structured,
      source: metadata,
      channel_context: channelContext,
    };

    await appendJsonRecord(LESSONS_FILE, record);
    return formatLessonSaved(record);
  }

  if (trimmed.startsWith('최근결정')) {
    const count = parseRecentCount(trimmed);
    const records = await getRecentRecords(DECISIONS_FILE, count);
    return formatRecentDecisions(records);
  }

  if (trimmed.startsWith('최근교훈')) {
    const count = parseRecentCount(trimmed);
    const records = await getRecentRecords(LESSONS_FILE, count);
    return formatRecentLessons(records);
  }

  if (trimmed.startsWith('실행큐:')) {
    const raw = trimmed.replace(/^실행큐:\s*/, '').trim();
    if (!raw) {
      return '실행큐: 뒤에 플랫폼/툴 아이디어·구현 요청 본문을 적어 주세요. (JSON 큐에 쌓여 Cursor/에이전트가 이어갈 수 있습니다.)';
    }
    const record = await appendWorkspaceQueueItem({
      kind: 'spec_intake',
      body: raw,
      metadata,
      channelContext,
    });
    return formatWorkspaceQueueSaved(record);
  }

  if (trimmed.startsWith('고객피드백:')) {
    const raw = trimmed.replace(/^고객피드백:\s*/, '').trim();
    if (!raw) {
      return '고객피드백: 뒤에 고객 목소리·이슈를 적어 주세요.';
    }
    const pack = await appendCustomerFeedbackWithAwqDraft({
      body: raw,
      metadata,
      channelContext,
    });
    return formatCustomerFeedbackIntakeComplete(pack);
  }

  if (trimmed.startsWith('실행큐목록')) {
    const count = parseRecentCount(trimmed.replace(/^실행큐목록\s*/, '') || trimmed);
    const items = await listWorkspaceQueueRecent('spec_intake', count);
    return formatWorkspaceQueueList(items, '실행 큐');
  }

  if (trimmed.startsWith('고객피드백목록')) {
    const count = parseRecentCount(trimmed.replace(/^고객피드백목록\s*/, '') || trimmed);
    const items = await listWorkspaceQueueRecent('customer_feedback', count);
    return formatWorkspaceQueueList(items, '고객 피드백 큐');
  }

  if (/^실행큐계획화\s*/u.test(trimmed) || /^실행큐계획\s*/u.test(trimmed)) {
    const raw = trimmed
      .replace(/^실행큐계획화\s*/u, '')
      .replace(/^실행큐계획\s*/u, '')
      .trim();
    let token = raw.split(/\s+/u)[0] || '';
    if (!token || /^(최근|latest|마지막)$/iu.test(token)) {
      const latest = await findLatestPromotableWorkspaceQueueId();
      if (!latest) {
        return [
          '[실행큐계획화] 승격 가능한 실행 큐(spec·미승격)가 없습니다.',
          '- `실행큐:` / `툴제작:` / `실행큐에 올려줘` 로 먼저 적재하세요.',
        ].join('\n');
      }
      token = latest;
    }
    const result = await promoteWorkspaceQueueSpecToPlan({
      queueId: token,
      metadata,
      channelContext,
      projectContext,
      envKey,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return `[실행큐계획화] 큐 항목 없음: ${token}`;
      }
      if (result.reason === 'wrong_kind') {
        return `[실행큐계획화] 실행(spec) 큐만 가능합니다: ${token}`;
      }
      if (result.reason === 'already_promoted') {
        const lid = result.item?.linked_plan_id || '—';
        return `[실행큐계획화] 이미 승격됨: ${token} → PLN \`${lid}\``;
      }
      if (result.reason === 'empty_body') {
        return `[실행큐계획화] 본문이 비어 있습니다: ${token}`;
      }
      return `[실행큐계획화] 오류: ${result.reason}`;
    }
    return formatWorkspaceQueuePromoteSlack({
      plan: result.plan,
      queueItem: result.queueItem,
    });
  }

}
