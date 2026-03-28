import 'dotenv/config';
import bolt from '@slack/bolt';
import OpenAI from 'openai';

const { App } = bolt;

import {
  DATA_DIR,
  DECISIONS_FILE,
  LESSONS_FILE,
  INTERACTIONS_FILE,
} from './src/storage/paths.js';
import {
  ensureStorage,
  appendJsonRecord,
  getRecentRecords,
} from './src/storage/jsonStore.js';
import {
  initApprovals,
  getPendingApprovals,
  upsertApprovalRecord,
  parseApprovalAction,
  updateApprovalStatus,
  formatPendingApprovals,
  formatPendingApprovalsSummary,
  formatApprovalUpdate,
} from './src/features/approvals.js';
import {
  initBriefs,
  buildDecisionHighlights,
  buildLessonHighlights,
  buildRiskHighlights,
  buildWeeklyBrief,
  buildExecutiveReport,
} from './src/features/briefs.js';
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
} from './src/features/workItems.js';
import { runPlannerHardLockedBranch } from './src/features/runPlannerHardLockedBranch.js';
import { formatError } from './src/util/formatError.js';
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
} from './src/features/workRuns.js';
import {
  createAdapterRunPayload,
  formatDispatchForSlack as formatRunDispatchForSlack,
  parseResultIntakeByTool,
  formatReviewForSlack,
} from './src/adapters/index.js';
import {
  getDefaultRepoForProject,
  getRepoForProjectEnv,
  setRepoForProject,
  clearRepoForProject,
} from './src/storage/repoRegistry.js';
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
} from './src/adapters/githubAdapter.js';
import {
  getDefaultDbForProject,
  getDbForProjectEnv,
  setDbForProject,
  clearDbForProject,
} from './src/storage/supabaseRegistry.js';
import {
  buildCursorHandoffMarkdown,
  writeCursorHandoffFile,
  buildCursorHandoffArtifact,
  extractGithubIssueFromWorkItem,
  inferCursorIngestResultStatus,
  mergeCursorHandoffResult,
  formatCursorHandoffSummaryLines,
} from './src/features/cursorHandoff.js';
import { prepareDispatch as prepareSupabaseDispatch } from './src/adapters/supabaseAdapter.js';
import { collectHealthSnapshot, formatHealthSnapshot } from './src/runtime/health.js';
import { validateEnv, formatEnvCheck, getRuntimeMode } from './src/runtime/env.js';
import {
  runStartupChecks,
  attachGracefulShutdown,
  startSlackAppWithRetry,
  attachUnhandledRejectionLogging,
  attachUncaughtExceptionLogging,
  logSlackSdkVersions,
  assertSocketModeMajorAtLeast2,
} from './src/runtime/startup.js';
import { startCosCiHookIfConfigured } from './src/runtime/ciWebhookServer.js';
import {
  JOB_NAMES,
  getAutomationSettings,
  setAutomationJobEnabled,
  formatAutomationSettings,
  runAutomationJob,
} from './src/automation/index.js';
import {
  initAgents,
  routeTask,
  runPrimaryAgent,
  runRiskAgent,
  composeFinalReport,
  deriveDecisionState,
  mergeRisks,
  bulletList,
} from './src/agents/index.js';
import { registerHandlers } from './src/slack/registerHandlers.js';
import { registerG1CosSlashCommand } from './src/slack/registerSlashCommands.js';
import { initStoreCore, getStoreCore } from './src/storage/core/index.js';
import { COLLECTION_NAMES } from './src/storage/core/types.js';
import {
  buildMigrationPlan,
  formatMigrationPlanForSlack,
} from './src/storage/core/migrateJsonToSupabase.js';
import { runInboundAiRouter } from './src/features/runInboundAiRouter.js';
import { runInboundCommandRouter } from './src/features/runInboundCommandRouter.js';
import { runInboundTurnTraceScope } from './src/features/inboundTurnTrace.js';
import { normalizeSlackUserPayload } from './src/slack/slackTextNormalize.js';
import { classifySurfaceIntent } from './src/features/surfaceIntentClassifier.js';
import { tryExecutiveSurfaceResponse } from './src/features/tryExecutiveSurfaceResponse.js';
import { finalizeSlackResponse as finalizeSlackResponseFromTopLevel } from './src/features/topLevelRouter.js';
import { CosSocketModeReceiver } from './src/slack/cosSocketModeReceiver.js';
import {
  loadConversationBufferFromDisk,
  flushConversationBufferToDisk,
} from './src/features/slackConversationBuffer.js';
import { formatCosNorthStarHelpPreamble } from './src/features/cosWorkflowPhases.js';
import { formatExecutiveHelpText } from './src/features/executiveSurfaceHelp.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const slackApp = new App({
  token: requireEnv('SLACK_BOT_TOKEN'),
  signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
  socketMode: true,
  appToken: requireEnv('SLACK_APP_TOKEN'),
  /** Slack WS 기본 pong 5s 는 불안정망에서 WARN 스팸 — CosSocketModeReceiver 기본 15s (`SLACK_SOCKET_CLIENT_PING_TIMEOUT_MS`). */
  receiver: new CosSocketModeReceiver({
    appToken: requireEnv('SLACK_APP_TOKEN'),
  }),
});

const openai = new OpenAI({
  apiKey: requireEnv('OPENAI_API_KEY'),
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
const RUNTIME_MODE = getRuntimeMode();

const AGENT_OPTIONS = [
  'general_cos',
  'strategy_finance',
  'ops_grants',
  'product_ux',
  'engineering',
  'risk_review',
];

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    adopted_option: { type: 'string' },
    strongest_objection: { type: 'string' },
    next_actions: {
      type: 'array',
      items: { type: 'string' },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['title', 'adopted_option', 'strongest_objection', 'next_actions', 'tags'],
};

const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    what_worked: { type: 'string' },
    what_failed: { type: 'string' },
    what_to_change_next_time: { type: 'string' },
    future_trigger: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'title',
    'what_worked',
    'what_failed',
    'what_to_change_next_time',
    'future_trigger',
    'tags',
  ],
};

function formatGithubIssuePublishSuccessLines({
  cmd,
  runId,
  workId,
  repoTarget,
  artifact,
  duplicate,
  persistenceStatus,
}) {
  const dupExplain = duplicate
    ? 'yes — 새 issue를 만들지 않음. 동일 work_item+repo duplicate guard로 기존 artifact만 반환.'
    : 'no — 신규 issue 생성';
  return [
    `${cmd} 완료`,
    `- persistence_status: ${persistenceStatus}`,
    `- duplicate: ${dupExplain}`,
    `- work_id: ${workId}`,
    `- run_id: ${runId}`,
    `- repo: ${repoTarget.owner}/${repoTarget.repo}`,
    `- issue_number: ${artifact.issue_number}`,
    `- issue_url: ${artifact.issue_url}`,
    `- state: ${artifact.state || 'unknown'}`,
    `- auth_mode: ${getGithubAuthMode()} (secret 미노출)`,
    '',
    '─ 다음 확인 ─',
    '- `업무상세` / `실행상세`: 저장 artifact 요약 블록',
    '- `깃허브상세`: GitHub live refresh(성공 시에만 work_item artifact 갱신)',
    '',
    '─ 정책 ─',
    '- 동일 work_item+repo에 issue가 있으면 재발행 안 함(force 미지원)',
  ].join('\n');
}

function formatGithubIssuePersistFailedLines({ cmd, workId, runId, artifact, duplicate, persistErr }) {
  return [
    `${cmd} 부분 실패 — GitHub에는 반영됐으나 COS 저장(persist) 실패`,
    `- persistence_status: persist_failed`,
    `- duplicate: ${duplicate ? 'yes (기존 issue 링크)' : 'no'}`,
    `- work_id: ${workId}`,
    `- run_id: ${runId}`,
    `- issue_number: ${artifact.issue_number}`,
    `- issue_url: ${artifact.issue_url}`,
    `- 저장 오류: ${formatError(persistErr)}`,
    '',
    '─ 다음 ─',
    '- `실행상세 ' + runId + '` 로 run 쪽 기록 확인',
    '- data 디렉터리·dual-write·Supabase 권한 점검 후 재시도',
  ].join('\n');
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function callJSON({ instructions, input, schemaName, schema }) {
  const response = await openai.responses.create({
    model: MODEL,
    instructions,
    input,
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        schema,
        strict: true,
      },
    },
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error(`Structured output was empty for ${schemaName}`);
  }

  return JSON.parse(text);
}

async function callText({ instructions, input }) {
  const response = await openai.responses.create({
    model: MODEL,
    instructions,
    input,
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error('Text output was empty');
  }

  return text;
}

initBriefs({ callText });
initAgents({ callJSON });
initApprovals({ makeId, deriveDecisionState, mergeRisks });

async function parseDecisionRecord(userText) {
  const instructions = `
당신은 G1.ART의 의사결정 기록 정리자다.
사용자가 남긴 자유서술을 의사결정 기록 형태로 구조화하라.
반드시 한국어로 정리하라.
title은 짧고 명확하게 작성하라.
tags는 너무 많지 않게 2~5개로 정리하라.
`;

  return callJSON({
    instructions,
    input: userText,
    schemaName: 'decision_record',
    schema: DECISION_SCHEMA,
  });
}

async function parseLessonRecord(userText) {
  const instructions = `
당신은 G1.ART의 교훈 기록 정리자다.
사용자가 남긴 자유서술을 교훈 기록 형태로 구조화하라.
반드시 한국어로 정리하라.
title은 짧고 명확하게 작성하라.
tags는 너무 많지 않게 2~5개로 정리하라.
`;

  return callJSON({
    instructions,
    input: userText,
    schemaName: 'lesson_record',
    schema: LESSON_SCHEMA,
  });
}

function formatDecisionSaved(record) {
  return [
    '의사결정 기록 저장 완료',
    `- ID: ${record.id}`,
    `- 제목: ${record.title}`,
    `- 채택안: ${record.adopted_option}`,
    `- 가장 강한 반대 논리: ${record.strongest_objection}`,
    `- 다음 행동:\n${bulletList(record.next_actions)}`,
    `- 태그: ${record.tags.join(', ')}`,
  ].join('\n');
}

function formatLessonSaved(record) {
  return [
    '교훈 기록 저장 완료',
    `- ID: ${record.id}`,
    `- 제목: ${record.title}`,
    `- 잘된 점: ${record.what_worked}`,
    `- 잘못된 점: ${record.what_failed}`,
    `- 다음부터 바꿀 점: ${record.what_to_change_next_time}`,
    `- 다음 재발 방지 트리거: ${record.future_trigger}`,
    `- 태그: ${record.tags.join(', ')}`,
  ].join('\n');
}

function formatRecentDecisions(records) {
  if (!records.length) return '저장된 의사결정 기록이 없습니다.';

  return [
    '최근 의사결정 기록',
    ...records.map(
      (r, i) =>
        `${i + 1}. ${r.title}\n- ID: ${r.id}\n- 채택안: ${r.adopted_option}\n- 태그: ${r.tags.join(', ')}`
    ),
  ].join('\n\n');
}

function formatRecentLessons(records) {
  if (!records.length) return '저장된 교훈 기록이 없습니다.';

  return [
    '최근 교훈 기록',
    ...records.map(
      (r, i) =>
        `${i + 1}. ${r.title}\n- ID: ${r.id}\n- 바꿀 점: ${r.what_to_change_next_time}\n- 태그: ${r.tags.join(', ')}`
    ),
  ].join('\n\n');
}

function parseRecentCount(text) {
  const match = text.trim().match(/\d+/);
  if (!match) return 5;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(n, 20);
}

function parseDays(text, defaultDays = 7) {
  const match = text.trim().match(/\d+/);
  if (!match) return defaultDays;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n <= 0) return defaultDays;
  return Math.min(n, 60);
}

/** 운영·에이전트·디버그 — `운영도움말` 에서만 노출 */
function operatorHelpText() {
  return [
    formatCosNorthStarHelpPreamble(),
    '**빠른 단축** (외울 필요 없음, 내비가 안내해 줌)',
    '- `COS …` / `비서 …` — 의도·합의·이행 단계 정리',
    '- `협의모드: …` — 다각 논의',
    '- `계획등록: …` — 실행 계획 구조화',
    '- 조회: `계획상세 PLN-…`, `업무상세 WRK-…` 등 (Council 없음)',
    '',
    '--- 아래는 전체 문자열 명령 참고용 (에이전트·COS가 대신 쓰는 실행 어휘) ---',
    '사용 가능한 기본 명령',
    '- 일반 질문: 그냥 그대로 입력',
    '- 결정기록: 자유 문장으로 의사결정 내용 저장',
    '- 실행큐: 플랫폼/툴 아이디어·구현 요청 → data/cos-workspace-queue.json (에이전트/Cursor 후속)',
    '- (자연어) 첫 줄 `실행큐에 올려줘`·`구현 큐에 넣어줘` 등 + 다음 줄 본문 — 또는 `실행큐에 올려줘: 본문` 한 줄',
    '- 실행큐목록 / 실행큐목록 10',
    '- 고객피드백: 고객 목소리·이슈 적재 (동일 큐, 별 kind)',
    '- (자연어) `고객피드백으로 저장` + 다음 줄 / `고객피드백으로 저장: 본문` / `피드백 큐에 넣어줘` + 다음 줄',
    '- 고객피드백목록 / 고객피드백목록 10',
    '- 교훈기록: 자유 문장으로 배운 점 저장',
    '- 최근결정',
    '- 최근결정 10',
    '- 최근교훈',
    '- 최근교훈 10',
    '- 채널설정: general_cos | strategy_finance | ops_grants | product_ux | engineering | risk_review',
    '- 현재채널설정',
    '- 채널설정해제',
    '- 승인대기',
    '- 승인대기 10',
    '- 승인 APR-... : 메모(선택)',
    '- 보류 APR-... : 메모(선택)',
    '- 폐기 APR-... : 메모(선택)',
    '- 업무등록: <자유 텍스트>',
    '- 계획등록: … / 계획등록 … / 자연어(계획 세워줘 등) → planner (Council 미사용)',
    '- 계획상세 <plan_id|번호>',
    '- 계획승인 <plan_id|번호>',
    '- 계획기각 <plan_id|번호> <사유(선택)>',
    '- 계획작업목록 <plan_id|번호>',
    '- 계획발행 <plan_id|번호>  (approved→ready_for_dispatch + 실행 안내)',
    '- 계획발행목록 <plan_id|번호>',
    '- 계획요약',
    '- 계획진행 <plan_id|번호>  (child work 집계 요약)',
    '- 계획시작 <plan_id|번호>  (plan → in_progress)',
    '- 계획완료 <plan_id|번호>  (child 전부 done일 때만)',
    '- 계획차단 <plan_id|번호> <사유>  (선택, blocked)',
    '- 계획변경 <plan_id|번호> <메모(선택)>  (본문 저장 없음·안내)',
    '- 업무대기 / 업무대기 10',
    '- 업무상세 <work_id|번호>',
    '- 업무승인 <work_id|번호>',
    '- 업무보류 <work_id|번호>',
    '- 업무취소 <work_id|번호>',
    '- 업무완료 <work_id|번호>',
    '- 업무실패 <work_id|번호>',
    '- 업무배정 <work_id|번호> <persona_or_tool>',
    '- 업무요약 / 업무요약 <project_key>',
    '- 업무발행 <work_id|번호>',
    '- 저장소설정: <repo_key>',
    '- 현재저장소설정',
    '- 저장소설정해제',
    '- 데이터베이스설정: <db_key>',
    '- 현재데이터베이스설정',
    '- 데이터베이스설정해제',
    '- 수파베이스발행 <work_id|번호>  (run 생성; 동일 WRK 활성 AWQ에 run 연결)',
    '- 마이그레이션초안 <work_id|번호>',
    '- 정책초안 <work_id|번호>',
    '- 함수초안 <work_id|번호>',
    '- 데이터수정초안 <work_id|번호>',
    '- 저장소규칙초안 <work_id|번호>',
    '- DB검토 <run_id|번호>',
    '- 롤백준비 <run_id|번호>',
    '- 롤백판정 <run_id|번호>',
    '- 롤백보류 <run_id|번호> <사유>',
    '- 깃허브점검  (read-only: auth/repo/issues API 경로 점검)',
    '- 이슈발행 <work_id|번호>  (GitHub issue live 생성, PAT; 성공 시 활성 AWQ에 run 연결)',
    '- 깃허브발행 <work_id|번호>  (이슈발행과 동일 alias)',
    '- 이슈초안 <work_id|번호>',
    '- 브랜치초안 <work_id|번호>',
    '- PR초안 <work_id|번호>',
    '- PR초안 <run_id|번호 또는 work_id|번호>',
    '- PR검토 <run_id|번호>',
    '- 머지판정 <run_id|번호>',
    '- 머지준비 <run_id|번호>',
    '- 머지보류 <run_id|번호> <사유>',
    '- 깃허브상세 <work_id|run_id|번호>',
    '- 실행대기',
    '- 실행중',
    '- 실행실패',
    '- 실행상세 <run_id|번호>',
    '- 업무진행 <work_id|번호>',
    '- 업무검토 <work_id|번호>  (요약 조회, 상태 변경 없음)',
    '- 업무수정요청 <work_id|번호> <사유>',
    '- 업무차단 <work_id|번호> <사유>',
    '- 업무재개 <work_id|번호>',
    '- 업무재발행 <work_id|번호>',
    '- 워크큐실행허가 <AWQ-…>  (에이전트 워크큐: pending_executive → queued)',
    '- 워크큐보류 <AWQ-…> <사유>',
    '- 워크큐재개 <AWQ-…>  (blocked → queued)',
    '- 워크큐착수 <AWQ-…>  (queued → in_progress)',
    '- 워크큐완료 <AWQ-…>  [증거 한 줄]',
    '- 워크큐증거 <AWQ-…> <한 줄>  (상태 유지, proof_refs 만 append)',
    '- 러너증거 <run_id> <한 줄>  (linked_run_id 일치 AWQ에 append)',
    '- 워크큐취소 <AWQ-…>',
    '- (CI) COS_CI_HOOK_PORT + COS_CI_HOOK_SECRET 시 GET /cos/health · POST /cos/ci-proof (JSON 증거 append)',
    '- (에이전트 브리지) COS_AGENT_BRIDGE_URL (+ 선택 COS_AGENT_BRIDGE_SECRET) 시 커서발행·이슈발행·수파베이스발행 성공 직후 외부 워커로 tool_dispatch JSON POST',
    '- 커서발행 <work_id|번호>  (handoff + cursor work_run; 동일 WRK의 활성 에이전트 워크큐에 run 연결)',
    '- 커서상세 <work_id|run_id|번호>',
    '- 커서결과기록 <work_id|run_id|번호> <한 줄 요약>',
    '- 결과등록 <run_id|번호>: <자유 텍스트>',
    '- 결과검토 <run_id|번호>',
    '- 결과승인 <run_id|번호>',
    '- 결과반려 <run_id|번호> <사유>',
    '- 막힘등록 <run_id|번호> <사유>',
    '- 상태점검',
    '- 환경점검',
    '- 아침브리프',
    '- 저녁정리',
    '- 승인대기요약',
    '- 막힘업무요약',
    '- 주간회고',
    '- 자동화설정',
    '- 자동화켜기 <job_name>',
    '- 자동화끄기 <job_name>',
    '- 환경프로필설정: dev | staging | prod',
    '- 현재환경프로필',
    '- 환경프로필해제',
    '- 저장소모드',
    '- 저장소점검',
    '- 저장소비교',
    '- 마이그레이션계획',
    '- 저장소요약',
    '- 배포준비점검',
    '- 연동프로필요약',
    '- 프로젝트설정: abstract | slack_cos | shared_tools | g1_ops',
    '- 현재프로젝트설정',
    '- 프로젝트설정해제',
    '- 협의모드: <질문>',
    '- 협의모드 strategy,product,engineering: <질문>',
    '- 매트릭스셀: <질문>',
    '- 관점추가 risk: <질문>',
    '- 주간브리프',
    '- 주간브리프 14',
    '- 대표보고서',
    '- 대표보고서 14',
    '- 이번주핵심결정',
    '- 이번주핵심교훈',
    '- 이번주리스크',
    '',
    '--- 도움말 분리 (Fast-Track) ---',
    '- `도움말` — **대표 표면** (5류, GOAL-IN / DECISION-OUT)',
    '- `운영도움말` — **본 목록** (내부 실행 어휘)',
  ].join('\n');
}

async function runLegacySingleFlow(trimmed, channelContext, metadata) {
  try {
    const sp = classifySurfaceIntent(trimmed);
    if (sp?.intent === 'start_project') {
      const surf = await tryExecutiveSurfaceResponse(trimmed, metadata);
      if (surf?.response_type === 'start_project') {
        return finalizeSlackResponseFromTopLevel({
          responder: 'executive_surface',
          text: surf.text,
          raw_text: trimmed,
          normalized_text: normalizeSlackUserPayload(String(trimmed ?? '').trim()),
          command_name: 'start_project',
          council_blocked: true,
          response_type: 'start_project',
        });
      }
    }
  } catch {
    /* fall through to primary+risk */
  }

  const route = await routeTask(trimmed, channelContext);
  const primary = await runPrimaryAgent(route.primary_agent, trimmed, channelContext);
  const risk = route.include_risk ? await runRiskAgent(trimmed, primary, channelContext) : null;
  const decisionState = deriveDecisionState(route, primary, risk);

  let approvalItem = null;
  if (decisionState.decisionNeeded) {
    approvalItem = await upsertApprovalRecord({
      userText: trimmed,
      metadata,
      channelContext,
      route,
      primary,
      risk,
    });
  }

  const text = composeFinalReport({
    route,
    primary,
    risk,
    channelContext,
    approvalItem,
  });

  await appendJsonRecord(INTERACTIONS_FILE, {
    id: makeId('INT'),
    created_at: new Date().toISOString(),
    user_text: trimmed,
    source: metadata,
    channel_context: channelContext,
    route,
    primary,
    risk,
    approval_id: approvalItem?.id || null,
    decision_needed: decisionState.decisionNeeded,
    orchestration_mode: 'single_primary_fallback',
  });

  return text;
}

function parseChannelSetting(text) {
  const match = text.trim().match(/^채널설정:\s*([a-z_]+)\s*$/);
  if (!match) return null;
  return match[1];
}

function parseProjectSetting(text) {
  const match = text.trim().match(/^프로젝트설정:\s*([a-z_]+)\s*$/);
  if (!match) return null;
  return match[1];
}

function parseWorkToken(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.trim().match(new RegExp(`^${escaped}\\s+([^\\s]+)`));
  if (!match) return null;
  return match[1];
}

function parseWorkAssign(text) {
  const match = text.trim().match(/^업무배정\s+([^\s]+)\s+([^\s]+)\s*$/);
  if (!match) return null;
  return { workId: match[1], assignee: match[2] };
}

function parseWorkBlock(text) {
  const match = text.trim().match(/^업무차단\s+([^\s]+)\s+(.+)\s*$/);
  if (!match) return null;
  return { workId: match[1], reason: match[2].trim() };
}

function parsePlanReject(text) {
  const match = text.trim().match(/^계획기각\s+([^\s]+)(?:\s+(.+))?$/);
  if (!match) return null;
  return { planId: match[1], reason: match[2] ? match[2].trim() : '' };
}

function parsePlanBlockCmd(text) {
  const match = text.trim().match(/^계획차단\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  return { planId: match[1], reason: match[2].trim() };
}

function parseWorkRevisionRequest(text) {
  const m = text.trim().match(/^업무수정요청\s+(\S+)\s+([\s\S]+)$/);
  if (!m) return null;
  return { workId: m[1], reason: m[2].trim() };
}

function parseRepoSetting(text) {
  const match = text.trim().match(/^저장소설정:\s*([^\s]+)\s*$/);
  if (!match) return null;
  return match[1];
}

function parseDbSetting(text) {
  const match = text.trim().match(/^데이터베이스설정:\s*([^\s]+)\s*$/);
  if (!match) return null;
  return match[1];
}

function parseGithubMergeReject(text) {
  const match = text.trim().match(/^머지보류\s+([^\s]+)\s+(.+)\s*$/);
  if (!match) return null;
  return { runId: match[1], reason: match[2].trim() };
}

function parseRollbackReject(text) {
  const match = text.trim().match(/^롤백보류\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  return { runId: match[1], reason: match[2].trim() };
}

function parseResultRegister(text) {
  const match = text.trim().match(/^결과등록\s+([^\s]+)\s*:\s*(.+)$/);
  if (!match) return null;
  return { runId: match[1], resultText: match[2].trim() };
}

function parseCursorResultRecord(text) {
  const match = text.trim().match(/^커서결과기록\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  return { idToken: match[1], summary: match[2].trim() };
}

async function resolveCursorRunFromToken(idToken) {
  const runDirect = await getWorkRun(idToken);
  if (runDirect) {
    if (runDirect.tool_key === 'cursor') return { run: runDirect, via: 'run_id' };
    return { run: null, via: 'wrong_tool', wrongRun: runDirect };
  }
  const item = await getWorkItem(idToken);
  if (item) {
    const run = await getLatestCursorRunForWork(item.id);
    if (run) return { run, via: 'work_id' };
    return { run: null, via: 'work_id', workId: item.id };
  }
  return { run: null, via: 'unknown' };
}

function parseResultReject(text) {
  const match = text.trim().match(/^결과반려\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  return { runId: match[1], reason: match[2].trim() };
}

function parseBlockedRun(text) {
  const match = text.trim().match(/^막힘등록\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  return { runId: match[1], reason: match[2].trim() };
}

async function handleUserText(userText, metadata = {}) {
  /**
   * 단일 파이프라인: getInboundCommandText 도 동일 정규화로 마감 — 이중 정규화 순서 불일치 방지.
   * @see runInboundCommandRouter
   * M2a: `runInboundTurnTraceScope` + `finalizeSlackResponse` → `markInboundTurnFinalize`.
   */
  const inputNorm = normalizeSlackUserPayload(String(userText ?? '').trim());
  return runInboundTurnTraceScope(metadata, inputNorm, async () => {
    const routed = await runInboundCommandRouter({
      userText,
      metadata,
      getExecutiveHelpText: () => formatExecutiveHelpText(),
      getOperatorHelpText: () => operatorHelpText(),
      runPlannerHardLockedBranch,
      structuredDeps: {
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
      },
    });
    if (routed.done) return routed.response;
    return runInboundAiRouter({
      ...routed.aiCtx,
      runPlannerHardLockedBranch,
      runLegacySingleFlow,
      makeId,
      callText,
      callJSON,
    });
  });
}

registerHandlers(slackApp, { handleUserText, formatError });
registerG1CosSlashCommand(slackApp);

(async () => {
  attachUnhandledRejectionLogging({ logger: console });
  attachUncaughtExceptionLogging({ logger: console });

  logSlackSdkVersions({ logger: console });
  assertSocketModeMajorAtLeast2({ logger: console });

  await ensureStorage();
  await loadConversationBufferFromDisk();
  initStoreCore({ storageMode: process.env.STORAGE_MODE });
  try {
    const st = getStoreCore();
    const supaPrimary =
      st.supabase_configured &&
      st.storage_read_preference === 'supabase' &&
      (st.storage_mode === 'dual' || st.storage_mode === 'supabase');
    console.info(
      JSON.stringify({
        startup_storage_profile: true,
        environment: process.env.NODE_ENV || 'development',
        runtime_mode: st.runtime_mode,
        storage_mode: st.storage_mode,
        read_source: supaPrimary ? 'supabase_primary' : 'json_primary',
        storage_read_preference: st.storage_read_preference,
        write_mode: st.storage_mode,
        fallback_on_supabase_read_error:
          supaPrimary ? 'enabled_json_fallback_logged' : 'not_applicable_or_json_only',
        silent_fallback: false,
        supabase_configured: st.supabase_configured,
        ssot_collections: st.live_dual_write_collections,
      })
    );
  } catch (e) {
    console.warn('[startup] storage profile log failed:', e?.message || e);
  }
  const ciHookServer = startCosCiHookIfConfigured({ logger: console });
  attachGracefulShutdown({
    slackApp,
    logger: console,
    beforeStop: async () => {
      await Promise.resolve(flushConversationBufferToDisk());
      if (ciHookServer) {
        await new Promise((resolve, reject) => {
          ciHookServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  });
  await runStartupChecks({ model: MODEL, logger: console });
  console.log('[startup] Starting G1 COS v6...');
  console.log('[startup] Runtime mode:', RUNTIME_MODE);
  console.log('[startup] Model:', MODEL);
  console.log('[startup] Data directory:', DATA_DIR);
  try {
    await startSlackAppWithRetry(slackApp, { attempts: 5, delayMs: 3000, logger: console });
    console.log('[startup] G1 COS v6 is running.');
  } catch (err) {
    console.error('[startup] Slack 연결 실패(재시도 소진):', formatError(err));
    process.exit(1);
  }
})();
