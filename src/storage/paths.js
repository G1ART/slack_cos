import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `src/storage/*` 기준이 아니라 프로젝트 루트 기준의 `data/` 경로가 필요합니다.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

/** Cursor handoff/spec 마크다운 (Phase 2a thin slice) */
export const CURSOR_HANDOFFS_DIR = path.join(PROJECT_ROOT, 'docs', 'cursor-handoffs');

export const DECISIONS_FILE = path.join(DATA_DIR, 'decision-log.json');
export const LESSONS_FILE = path.join(DATA_DIR, 'lessons-learned.json');
export const INTERACTIONS_FILE = path.join(DATA_DIR, 'interaction-log.json');
export const CHANNELS_FILE = path.join(DATA_DIR, 'channel-context.json');
export const APPROVALS_FILE = path.join(DATA_DIR, 'approval-queue.json');
export const WORK_ITEMS_FILE = path.join(DATA_DIR, 'work-items.json');
export const PROJECT_CONTEXT_FILE = path.join(DATA_DIR, 'project-context.json');
export const WORK_RUNS_FILE = path.join(DATA_DIR, 'work-runs.json');
/** Planner / intake artifacts (Phase 3a — JSON-first, dual-write 비대상) */
export const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
export const AUTOMATION_SETTINGS_FILE = path.join(DATA_DIR, 'automation-settings.json');
export const REPO_REGISTRY_FILE = path.join(DATA_DIR, 'repo-registry.json');
export const ENV_PROFILES_FILE = path.join(DATA_DIR, 'environment-profiles.json');
export const ENV_CONTEXT_FILE = path.join(DATA_DIR, 'environment-context.json');
export const SUPABASE_REGISTRY_FILE = path.join(DATA_DIR, 'supabase-registry.json');

/** Slack 스레드/DM 대화 버퍼 스냅샷 (`CONVERSATION_BUFFER_PERSIST` on 일 때만 쓰기) */
export const CONVERSATION_BUFFER_FILE = path.join(DATA_DIR, 'slack-conversation-buffer.json');

/** `start_project` sticky 인테이크 세션 (`PROJECT_INTAKE_SESSION_PERSIST` on 일 때) */
export const PROJECT_INTAKE_SESSIONS_FILE = path.join(DATA_DIR, 'project-intake-sessions.json');

export function resolveProjectIntakeSessionsPath() {
  const v = process.env.PROJECT_INTAKE_SESSIONS_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return PROJECT_INTAKE_SESSIONS_FILE;
}

/** North Star 최단거리: 구현·아이디어 / 고객 피드백 인테이크 큐 (JSON, 에이전트·Cursor 후속 액션용) */
export const COS_WORKSPACE_QUEUE_FILE = path.join(DATA_DIR, 'cos-workspace-queue.json');

/** 테스트·격리: `COS_WORKSPACE_QUEUE_FILE` */
export function resolveCosWorkspaceQueuePath() {
  const v = process.env.COS_WORKSPACE_QUEUE_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return COS_WORKSPACE_QUEUE_FILE;
}

/** 테스트·격리: `PLANS_FILE` */
export function resolvePlansPath() {
  const v = process.env.PLANS_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return PLANS_FILE;
}

/** 테스트·격리: `WORK_ITEMS_FILE` */
export function resolveWorkItemsPath() {
  const v = process.env.WORK_ITEMS_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return WORK_ITEMS_FILE;
}

/** M2a inbound turn lineage — append-only JSONL (`INBOUND_TURN_TRACE_FILE` 로 오버라이드 가능) */
export function resolveInboundTurnTracePath() {
  const v = process.env.INBOUND_TURN_TRACE_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return path.join(DATA_DIR, 'inbound-turn-trace.jsonl');
}

/** M2b decision packet audit (append-only JSONL; `DECISION_PACKETS_JSONL_FILE` 로 오버라이드) */
export function resolveDecisionPacketsJsonlPath() {
  const v = process.env.DECISION_PACKETS_JSONL_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return path.join(DATA_DIR, 'decision-packets.jsonl');
}

/** M2b status packet audit (append-only JSONL; `STATUS_PACKETS_JSONL_FILE` 로 오버라이드) */
export function resolveStatusPacketsJsonlPath() {
  const v = process.env.STATUS_PACKETS_JSONL_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return path.join(DATA_DIR, 'status-packets.jsonl');
}

/** Last decision packet per Slack thread/DM key (`THREAD_DECISION_TAIL_FILE` 로 오버라이드) */
export function resolveThreadDecisionTailPath() {
  const v = process.env.THREAD_DECISION_TAIL_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return path.join(DATA_DIR, 'cos-thread-decision-tail.json');
}

/** Execution spine runs (append-only JSON array) */
export const EXECUTION_RUNS_FILE = path.join(DATA_DIR, 'execution-runs.json');

export function resolveExecutionRunsPath() {
  const v = process.env.EXECUTION_RUNS_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return EXECUTION_RUNS_FILE;
}

/** M3 agent work queue seed — JSON 배열 (`AGENT_WORK_QUEUE_FILE` 로 오버라이드) */
export function resolveAgentWorkQueuePath() {
  const v = process.env.AGENT_WORK_QUEUE_FILE;
  if (v) return path.isAbsolute(v) ? v : path.join(PROJECT_ROOT, v);
  return path.join(DATA_DIR, 'agent-work-queue.json');
}

