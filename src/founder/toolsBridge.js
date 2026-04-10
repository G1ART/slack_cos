/**
 * 외부 툴 TOOL_ADAPTERS — live는 런타임에서 실제로 실행 가능할 때만, 그 외 artifact.
 * Readiness: 호스트·env·바이너리 기준 진실 (추정 live 금지).
 */

import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  appendExecutionArtifact,
  cosRuntimeBaseDir,
  hasRecentToolLiveCompleted,
} from './executionLedger.js';
import {
  isCursorCloudAgentLaneReady,
  isCursorCloudAgentEnabled,
  isCursorAutomationConfigured,
  triggerCursorAutomation,
  automationEndpointHostOnly,
  isCursorAutomationSmokeMode,
  acceptanceResponseHasCallbackMetadataKeys,
} from './cursorCloudAdapter.js';
import { isOpsSmokeEnabled, resolveSmokeSessionId } from './smokeOps.js';
import { recordCosPretriggerAudit } from './pretriggerAudit.js';
import { emitPatchHasCloudContractSource } from './livePatchPayload.js';
import { getExecutionProfileForThread, evaluateCursorActionAgainstProfile } from './executionProfile.js';
import {
  mergeEmitPatchPayloadForDispatch,
  compileEmitPatchForCloudAutomation,
  describeEmitPatchAssemblyBlock,
  REJECTION_KIND_EXECUTION_PROFILE,
  REJECTION_KIND_MISSING_CONTRACT_SOURCE,
  REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
  EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
} from './cursorLivePatchDispatch.js';

/** Cloud lane eligible but emit_patch payload did not compile to automation contract — do not fall through to artifact. */
export const EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD = 'external_call_blocked_empty_compiled_payload';

const execFileAsync = promisify(execFile);

/** Machine reason: founder must supply structured delegate narrow live_patch before cloud emit_patch. */
export const DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH = 'delegate_packets_missing_for_emit_patch';

/** Live-only/no-fallback thread: cloud emit_patch requires merged delegate packet (cannot bypass via packet_id alone). */
export const DELEGATE_REQUIRED_BEFORE_EMIT_PATCH = 'delegate_required_before_emit_patch';

/** Structured delegate had live_only+no_fallback emit_patch — create_spec is not allowed on this thread. */
export const CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE = 'create_spec_disallowed_in_live_only_mode';

/** @type {Promise<typeof import('./delegateEmitPatchStash.js')> | null} */
let delegateEmitPatchStashLoad = null;
function loadDelegateEmitPatchStash() {
  if (!delegateEmitPatchStashLoad) delegateEmitPatchStashLoad = import('./delegateEmitPatchStash.js');
  return delegateEmitPatchStashLoad;
}

export {
  isCursorCloudAgentLaneReady as isCursorCloudAgentConfigured,
  isCursorCloudAgentEnabled,
  isCursorAutomationConfigured,
} from './cursorCloudAdapter.js';

/** 테스트 전용: Cursor live 경로의 execFile 대체 (@param {typeof execFileAsync | null} fn */
export const __cursorExecFileForTests = { fn: /** @type {typeof execFileAsync | null} */ (null) };

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

/** PostgREST RPC 이름 — DB에 함수가 있어야 apply_sql live 성공 */
export const SUPABASE_APPLY_SQL_RPC = 'cos_apply_sql';

/** @typedef {'completed'|'degraded'|'blocked'|'failed'} ToolExecutionStatus */

/** outcome_code — ledger·요약에서 실행 진실 구분 */
export const TOOL_OUTCOME_CODES = {
  LIVE_COMPLETED: 'live_completed',
  ARTIFACT_PREPARED: 'artifact_prepared',
  DEGRADED_FROM_LIVE_FAILURE: 'degraded_from_live_failure',
  DEGRADED_FROM_LIVE_EXCEPTION: 'degraded_from_live_exception',
  BLOCKED_MISSING_INPUT: 'blocked_missing_input',
  FAILED_ARTIFACT_BUILD: 'failed_artifact_build',
  FAILED_LIVE_AND_ARTIFACT: 'failed_live_and_artifact',
  /** Cursor Cloud Agent accepted async work; packet stays running until webhook */
  CLOUD_AGENT_DISPATCH_ACCEPTED: 'cloud_agent_dispatch_accepted',
};

/** 테스트: 특정 도구의 artifact 빌드만 실패시키기 */
export const __invokeToolTestHooks = { failArtifactForTool: /** @type {string | null} */ (null) };

/**
 * @param {string} status
 * @returns {'delivered'|'pending'|'timeout'|'unavailable'|'unknown'}
 */
function mapOrchestratorStatusToDeliveryState(status) {
  const s = String(status || '').trim();
  if (!s) return 'unknown';
  if (s === 'provider_callback_matched' || s === 'synthetic_callback_matched' || s === 'manual_probe_closure_observed') {
    return 'delivered';
  }
  if (s === 'callback_timeout') return 'timeout';
  if (
    s === 'skipped_no_contract' ||
    s === 'skipped_url_not_allowlisted' ||
    s === 'skipped_no_fetch' ||
    s === 'skipped_missing_inputs'
  ) {
    return 'unavailable';
  }
  if (s === 'skipped_idempotent') return 'delivered';
  return 'pending';
}

/**
 * 호출 전 차단 — credential/필수 payload 없으면 live·artifact 시도 없이 blocked.
 * @param {string} tool
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv} env
 */
export function toolInvocationBlocked(tool, action, payload, env) {
  const e = env || process.env;
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (tool === 'railway' && action === 'inspect_logs') {
    if (!String(e.RAILWAY_TOKEN || '').trim()) {
      return {
        blocked: true,
        blocked_reason: 'missing RAILWAY_TOKEN',
        next_required_input: null,
      };
    }
    const dep = String(pl.deployment_id || e.RAILWAY_DEPLOYMENT_ID || '').trim();
    if (!dep) {
      return {
        blocked: true,
        blocked_reason: 'inspect_logs requires deployment_id in payload or RAILWAY_DEPLOYMENT_ID',
        next_required_input: 'deployment_id',
      };
    }
  }
  if (tool === 'github') {
    if (!resolveGithubToken(e)) {
      return {
        blocked: true,
        blocked_reason: 'missing GITHUB_TOKEN or GITHUB_FINE_GRAINED_PAT',
        next_required_input: null,
      };
    }
    if (!parseGithubRepoFromEnv(e)) {
      return {
        blocked: true,
        blocked_reason: 'missing GITHUB_REPOSITORY or GITHUB_DEFAULT_OWNER/REPO',
        next_required_input: null,
      };
    }
    if (action === 'open_pr' && !String(pl.head || '').trim()) {
      return {
        blocked: true,
        blocked_reason: 'open_pr requires payload.head',
        next_required_input: 'head',
      };
    }
  }
  if (tool === 'supabase' && action === 'apply_sql') {
    const url = String(e.SUPABASE_URL || '').trim();
    const key = String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) {
      return {
        blocked: true,
        blocked_reason: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        next_required_input: null,
      };
    }
    if (!String(pl.sql || pl.query || '').trim()) {
      return {
        blocked: true,
        blocked_reason: 'apply_sql requires payload.sql',
        next_required_input: 'sql',
      };
    }
  }
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

/** @param {string} sub */
async function artifactSubdir(sub) {
  const dir = path.join(cosRuntimeBaseDir(), 'artifacts', sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** 도구별 허용 action */
export const TOOL_ALLOWED_ACTIONS = {
  cursor: new Set(['create_spec', 'emit_patch']),
  github: new Set(['create_issue', 'open_pr']),
  supabase: new Set(['apply_sql']),
  vercel: new Set(['deploy']),
  railway: new Set(['inspect_logs', 'deploy']),
};

/** @param {string} tool @param {string} action */
export function isValidToolAction(tool, action) {
  const a = String(action || '').trim();
  const set = TOOL_ALLOWED_ACTIONS[tool];
  return !!set && set.has(a);
}

/**
 * GitHub 토큰: GITHUB_TOKEN 우선, 없으면 GITHUB_FINE_GRAINED_PAT.
 * @param {Record<string, string | undefined>} env
 */
export function resolveGithubToken(env) {
  const e = env && typeof env === 'object' ? env : process.env;
  const a = String(e.GITHUB_TOKEN || '').trim();
  if (a) return a;
  return String(e.GITHUB_FINE_GRAINED_PAT || '').trim();
}

/**
 * owner/repo 문자열: GITHUB_REPOSITORY 우선, 없으면 GITHUB_DEFAULT_OWNER/REPO.
 * @param {Record<string, string | undefined>} env
 */
export function resolveGithubRepositoryString(env) {
  const e = env && typeof env === 'object' ? env : process.env;
  const r = String(e.GITHUB_REPOSITORY || '').trim();
  if (r) return r;
  const owner = String(e.GITHUB_DEFAULT_OWNER || '').trim();
  const repoName = String(e.GITHUB_DEFAULT_REPO || '').trim();
  if (owner && repoName) return `${owner}/${repoName}`;
  return '';
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {'GITHUB_TOKEN' | 'GITHUB_FINE_GRAINED_PAT' | null}
 */
export function resolveGithubTokenSource(env) {
  const e = env && typeof env === 'object' ? env : process.env;
  if (String(e.GITHUB_TOKEN || '').trim()) return 'GITHUB_TOKEN';
  if (String(e.GITHUB_FINE_GRAINED_PAT || '').trim()) return 'GITHUB_FINE_GRAINED_PAT';
  return null;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {'GITHUB_REPOSITORY' | 'GITHUB_DEFAULT_OWNER_REPO' | null}
 */
export function resolveGithubRepositorySource(env) {
  const e = env && typeof env === 'object' ? env : process.env;
  if (String(e.GITHUB_REPOSITORY || '').trim()) return 'GITHUB_REPOSITORY';
  const owner = String(e.GITHUB_DEFAULT_OWNER || '').trim();
  const repoName = String(e.GITHUB_DEFAULT_REPO || '').trim();
  if (owner && repoName) return 'GITHUB_DEFAULT_OWNER_REPO';
  return null;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function parseGithubRepoFromEnv(env) {
  const r = resolveGithubRepositoryString(env);
  const parts = r.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * @param {string} urlStr
 */
function isPlausibleSupabaseUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<string | null>} absolute path to executable
 */
async function resolveCursorCliPath(env) {
  const explicit = String(env.CURSOR_CLI_BIN || '').trim();
  const candidates = explicit ? [explicit] : ['agent', 'cursor-agent'];
  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : c;
    if (path.isAbsolute(abs)) {
      try {
        await fs.access(abs, fsSync.constants.F_OK);
        return abs;
      } catch {
        continue;
      }
    }
    try {
      const { stdout } = await execFileAsync('/bin/sh', ['-lc', `command -v ${JSON.stringify(c)}`], {
        encoding: 'utf8',
        maxBuffer: 4096,
      });
      const p = String(stdout || '').trim().split('\n')[0];
      if (p) return p;
    } catch {
      /* PATH에 없음 */
    }
  }
  return null;
}

/**
 * @param {Record<string, string | undefined>} env
 */
function cursorProjectDir(env) {
  const d = String(env.CURSOR_PROJECT_DIR || '').trim();
  return d ? path.resolve(d) : process.cwd();
}

/**
 * @param {string} dir
 */
async function isDir(dir) {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * @typedef {object} AdapterReadiness
 * @property {string} tool
 * @property {boolean} declared any relevant env/CLI declaration present (may be partial)
 * @property {boolean} configured minimum complete local contract for that adapter
 * @property {boolean} live_capable live attempt possible in this runtime
 * @property {string} reason
 * @property {string[]} missing
 * @property {Record<string, unknown>} details
 */

/**
 * @param {string} tool
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ threadKey?: string }} [options] supabase contract_state용 ledger 조회
 * @returns {Promise<AdapterReadiness>}
 */
export async function getAdapterReadiness(tool, env = process.env, options = {}) {
  const e = env || process.env;
  const threadKeyOpt = options.threadKey ? String(options.threadKey) : '';

  if (tool === 'github') {
    const token = resolveGithubToken(e);
    const repoRaw = resolveGithubRepositoryString(e);
    const repo = parseGithubRepoFromEnv(e);
    const tokenSrc = resolveGithubTokenSource(e);
    const repoSrc = resolveGithubRepositorySource(e);
    const missing = [];
    if (!token) missing.push('GITHUB_TOKEN or GITHUB_FINE_GRAINED_PAT');
    if (!repoRaw) missing.push('GITHUB_REPOSITORY or GITHUB_DEFAULT_OWNER + GITHUB_DEFAULT_REPO');
    else if (!repo) missing.push('repository(parse: need owner/repo)');
    const declared =
      !!String(e.GITHUB_TOKEN || '').trim() ||
      !!String(e.GITHUB_FINE_GRAINED_PAT || '').trim() ||
      !!String(e.GITHUB_REPOSITORY || '').trim() ||
      !!String(e.GITHUB_DEFAULT_OWNER || '').trim() ||
      !!String(e.GITHUB_DEFAULT_REPO || '').trim();
    const configured = !!token && !!repo;
    const live_capable = configured;
    const reason = live_capable
      ? `configured: token+repo OK → REST live (token:${tokenSrc}, repo:${repoSrc})`
      : !declared
        ? 'declared: 없음 → artifact'
        : !token
          ? 'declared: 저장소·alias만 있음 — 토큰 없음 → artifact'
          : !repoRaw
            ? 'declared: 토큰만 있음 — 저장소 없음 → artifact'
            : 'declared: 부분 설정 — 저장소 형식 오류(owner/repo) → artifact';
    return {
      tool: 'github',
      declared,
      live_capable,
      configured,
      reason,
      missing,
      details: {
        has_token: !!token,
        repo_parse_ok: !!repo,
        effective_repository: repoRaw || null,
        github_token_source: tokenSrc,
        github_repository_source: repoSrc,
      },
    };
  }

  if (tool === 'supabase') {
    const url = String(e.SUPABASE_URL || '').trim();
    const key = String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    const urlOk = !!(url && isPlausibleSupabaseUrl(url));
    if (url && !urlOk) missing.push('SUPABASE_URL(invalid)');
    const declared = !!(url || key);
    const configured = !!(url && key && urlOk);
    const live_capable = configured;
    /** @type {'missing_env'|'env_ready_unverified'|'verified_recent_success'} */
    let contract_state = 'missing_env';
    if (!url || !key || !urlOk) contract_state = 'missing_env';
    else if (threadKeyOpt && (await hasRecentToolLiveCompleted(threadKeyOpt, 'supabase'))) {
      contract_state = 'verified_recent_success';
    } else {
      contract_state = 'env_ready_unverified';
    }
    const reason = !declared
      ? 'declared: 없음 → artifact/blocked'
      : !configured
        ? 'declared: URL·키 중 일부만 있거나 URL 무효 — configured 아님 → artifact/blocked'
        : contract_state === 'verified_recent_success'
          ? `configured + ledger live_completed · RPC ${SUPABASE_APPLY_SQL_RPC}`
          : `configured — contract:${contract_state} (ledger 검증 전)`;
    return {
      tool: 'supabase',
      declared,
      live_capable,
      configured,
      reason,
      missing,
      details: {
        url_present: !!url,
        url_valid: urlOk,
        service_role_present: !!key,
        rpc: SUPABASE_APPLY_SQL_RPC,
        contract_state,
      },
    };
  }

  if (tool === 'cursor') {
    const cliPath = await resolveCursorCliPath(e);
    const cwd = cursorProjectDir(e);
    const cwdOk = await isDir(cwd);
    const binDeclared = !!String(e.CURSOR_CLI_BIN || '').trim();
    const dirDeclared = !!String(e.CURSOR_PROJECT_DIR || '').trim();
    const epDeclared = !!String(e.CURSOR_AUTOMATION_ENDPOINT || '').trim();
    const authDeclared = !!String(e.CURSOR_AUTOMATION_AUTH_HEADER || '').trim();
    const automationLane = isCursorCloudAgentLaneReady(e);
    const enabledNoCreds = isCursorCloudAgentEnabled(e) && !isCursorAutomationConfigured(e);
    const declared =
      binDeclared || !!cliPath || dirDeclared || epDeclared || authDeclared || isCursorCloudAgentEnabled(e);
    const missing = [];
    if (!cliPath && !automationLane) missing.push('CURSOR_CLI_BIN 또는 PATH의 agent|cursor-agent');
    if (!cwdOk && !automationLane) missing.push('CURSOR_PROJECT_DIR(존재하는 디렉터리)');
    const configured = !!cliPath && cwdOk;
    const live_capable = configured || automationLane;
    const reason = automationLane
      ? 'CURSOR_CLOUD_AGENT_ENABLED=1 + Automation(endpoint+auth) → cloud_agent(create_spec|emit_patch); 웹훅 완료; CLI 폴백'
      : enabledNoCreds
        ? 'CURSOR_CLOUD_AGENT_ENABLED=1 이지만 CURSOR_AUTOMATION_* 없음 → CLI 또는 artifact'
        : live_capable
          ? 'configured: CLI+cwd OK → create_spec live; emit_patch는 cloud 없으면 artifact'
          : !declared
            ? 'declared: 없음 → artifact-only'
            : !cliPath
              ? 'declared: CLI 미해결 → artifact-only'
              : 'declared: cwd 없음/무효 → artifact-only';
    return {
      tool: 'cursor',
      declared,
      live_capable,
      configured,
      reason,
      missing,
      details: {
        cli_path: cliPath,
        cwd,
        cwd_ok: cwdOk,
        cloud_agent_lane_ready: automationLane,
        automation_endpoint_host: automationLane ? automationEndpointHostOnly(e.CURSOR_AUTOMATION_ENDPOINT) : null,
        execution_lane_preference: automationLane ? 'cloud_agent' : configured ? 'local_cli' : 'artifact',
        live_actions: automationLane ? ['create_spec', 'emit_patch'] : ['create_spec'],
        artifact_actions: automationLane ? [] : ['emit_patch'],
      },
    };
  }

  if (tool === 'railway') {
    const token = String(e.RAILWAY_TOKEN || '').trim();
    const dep = String(e.RAILWAY_DEPLOYMENT_ID || '').trim();
    const missing = [];
    if (!token) missing.push('RAILWAY_TOKEN');
    if (!dep) missing.push('RAILWAY_DEPLOYMENT_ID 또는 payload.deployment_id');
    const declared = !!(token || dep);
    const configured = !!token;
    const inspectLiveCapable = !!token && !!dep;
    const live_capable = inspectLiveCapable;
    const reason = !declared
      ? 'declared: 토큰·기본 deployment_id 없음 → inspect_logs blocked/artifact'
      : !configured
        ? 'configured: 토큰 없음 (deployment_id만 선언) → artifact'
        : inspectLiveCapable
          ? 'configured: 토큰+deployment_id → inspect_logs live 가능; deploy: 비활성'
          : 'configured: 토큰 있음 — deployment_id 필요 → inspect_logs live 불가';
    return {
      tool: 'railway',
      declared,
      live_capable,
      configured,
      reason,
      missing: token ? (dep ? [] : ['deployment_id']) : ['RAILWAY_TOKEN'],
      details: {
        has_token: !!token,
        default_deployment_id: dep || null,
        inspect_logs_live_capable: inspectLiveCapable,
        deploy_live: false,
        deploy_blocked_reason: '이 빌드에서 railway deploy live 미개방',
      },
    };
  }

  if (tool === 'vercel') {
    return {
      tool: 'vercel',
      declared: false,
      live_capable: false,
      configured: false,
      reason: 'declared/configured/live 미구현 → 항상 artifact-only',
      missing: [],
      details: { deploy_live: false },
    };
  }

  return {
    tool: String(tool),
    declared: false,
    live_capable: false,
    configured: false,
    reason: 'unknown tool',
    missing: [],
    details: {},
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ threadKey?: string }} [options]
 * @returns {Promise<AdapterReadiness[]>}
 */
export async function getAllAdapterReadiness(env = process.env, options = {}) {
  const tools = ['github', 'supabase', 'cursor', 'railway', 'vercel'];
  const out = [];
  for (const t of tools) {
    out.push(await getAdapterReadiness(t, env, options));
  }
  return out;
}

/**
 * COS 시스템 입력용 1줄 요약 (최대 6줄 권장).
 * @param {AdapterReadiness} r
 */
export function formatAdapterReadinessOneLine(r) {
  if (r.tool === 'github') {
    const d = r.details;
    const ts = d.github_token_source;
    const rs = d.github_repository_source;
    const tag =
      ts && rs && (ts !== 'GITHUB_TOKEN' || rs !== 'GITHUB_REPOSITORY')
        ? ` [${ts}+${rs}]`
        : '';
    return `github: ${r.live_capable ? 'live-ready' : 'artifact'}${tag} — ${r.reason}`;
  }
  if (r.tool === 'supabase') {
    const cs = r.details?.contract_state ? String(r.details.contract_state) : '';
    const csPart = cs ? ` [${cs}]` : '';
    return `supabase: ${r.live_capable ? 'live-ready(apply_sql→rpc)' : 'artifact'}${csPart} — ${r.reason}`;
  }
  if (r.tool === 'cursor') {
    return `cursor: ${r.live_capable ? 'create_spec live-ready' : 'artifact-only'} — ${r.reason}`;
  }
  if (r.tool === 'railway') {
    const d = r.details;
    const ins = d.inspect_logs_live_capable ? 'inspect_logs-ready' : 'inspect_logs-needs-deployment_id';
    return `railway: ${ins} / deploy-disabled — ${r.reason}`;
  }
  if (r.tool === 'vercel') {
    return `vercel: artifact-only — ${r.reason}`;
  }
  return `${r.tool}: ${r.live_capable ? 'live' : 'artifact'} — ${r.reason}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {number} [max]
 * @param {string} [threadKey] supabase contract_state
 * @returns {Promise<string[]>}
 */
export async function formatAdapterReadinessCompactLines(env = process.env, max = 6, threadKey = '') {
  const all = await getAllAdapterReadiness(env, { threadKey });
  return all.map(formatAdapterReadinessOneLine).slice(0, max);
}

const TOOL_ADAPTERS = {
  cursor: {
    /** @param {string} action */
    async canExecuteLive(action, _payload, env) {
      if (action !== 'create_spec') return false;
      const cliPath = await resolveCursorCliPath(env);
      const cwd = cursorProjectDir(env);
      return !!(cliPath && (await isDir(cwd)));
    },
    async executeLive(action, payload, env) {
      const cli = await resolveCursorCliPath(env);
      const cwd = cursorProjectDir(env);
      if (!cli) return { ok: false, result_summary: 'Cursor CLI not found', error_code: 'cursor_no_cli' };
      if (!(await isDir(cwd))) return { ok: false, result_summary: 'CURSOR_PROJECT_DIR invalid', error_code: 'cursor_bad_cwd' };

      const title = String(payload.title || payload.name || 'spec').slice(0, 300);
      const body = String(payload.body || payload.content || '').slice(0, 12000);
      const extra = Array.isArray(payload.cli_args)
        ? payload.cli_args.map((x) => String(x))
        : String(env.CURSOR_CREATE_SPEC_ARGS || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
      const baseArgs =
        extra.length > 0 ? extra : ['create_spec', title];
      const execImpl = __cursorExecFileForTests.fn || execFileAsync;
      try {
        const { stdout, stderr } = await execImpl(cli, baseArgs, {
          cwd,
          timeout: Number(env.CURSOR_CLI_TIMEOUT_MS || 120_000),
          maxBuffer: 2_000_000,
          env: { ...process.env, COS_CURSOR_SPEC_BODY: body },
        });
        const out = String(stdout || '').slice(0, 8000);
        const err = String(stderr || '').slice(0, 4000);
        return {
          ok: true,
          result_summary: `live: cursor create_spec exit 0 (${out.length}b stdout)`,
          data: { stdout: out, stderr: err, exit_code: 0, cli, cwd, argv: baseArgs },
        };
      } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? Number(e.code) : null;
        const stdout = e && typeof e === 'object' && 'stdout' in e ? String(e.stdout || '').slice(0, 4000) : '';
        const stderr = e && typeof e === 'object' && 'stderr' in e ? String(e.stderr || '').slice(0, 4000) : '';
        return {
          ok: false,
          result_summary: `cursor CLI failed: ${String(e?.message || e).slice(0, 160)}`,
          error_code: code != null && !Number.isNaN(code) ? `cursor_exit_${code}` : 'cursor_exec_error',
          data: { stdout, stderr, exit_code: code, cli, cwd, argv: baseArgs },
        };
      }
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await artifactSubdir('cursor');
      const ext = action === 'emit_patch' ? 'patch' : 'spec';
      const fn = `${ext}_${invocation_id}.md`;
      const fp = path.join(dir, fn);
      const title = String(payload.title || payload.name || action).slice(0, 200);
      const body = String(payload.body || payload.content || payload.markdown || `# ${title}\n\n(COS payload 스냅샷)\n\`\`\`json\n${JSON.stringify(payload, null, 0).slice(0, 12000)}\n\`\`\`\n`);
      await fs.writeFile(fp, body, 'utf8');
      return {
        ok: true,
        result_summary: `artifact: cursor/${action} → ${fp}`,
        artifact_path: fp,
      };
    },
  },

  github: {
    canExecuteLive(action, _payload, env) {
      if (!resolveGithubToken(env)) return false;
      if (!parseGithubRepoFromEnv(env)) return false;
      if (action === 'create_issue') return true;
      if (action === 'open_pr') return true;
      return false;
    },
    async executeLive(action, payload, env) {
      const token = resolveGithubToken(env);
      const repo = parseGithubRepoFromEnv(env);
      if (!token) return { ok: false, result_summary: 'GitHub token missing', error_code: 'no_token' };
      if (!repo) return { ok: false, result_summary: 'GitHub repository not configured', error_code: 'no_repo' };

      if (action === 'create_issue') {
        const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            title: String(payload.title || 'COS issue'),
            body: String(payload.body || ''),
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, result_summary: `GitHub ${res.status}: ${text.slice(0, 200)}`, error_code: `github_${res.status}` };
        }
        const data = JSON.parse(text);
        return {
          ok: true,
          result_summary: `live: issue #${data.number} created`,
          data,
        };
      }

      if (action === 'open_pr') {
        const head = String(payload.head || '').trim();
        const base = String(payload.base || 'main').trim();
        if (!head) {
          return { ok: false, result_summary: 'open_pr requires payload.head', error_code: 'missing_head' };
        }
        const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            title: String(payload.title || 'COS PR'),
            head,
            base,
            body: String(payload.body || ''),
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, result_summary: `GitHub PR ${res.status}: ${text.slice(0, 200)}`, error_code: `github_pr_${res.status}` };
        }
        const data = JSON.parse(text);
        return {
          ok: true,
          result_summary: `live: PR #${data.number} opened`,
          data,
        };
      }

      return { ok: false, result_summary: 'unknown github action', error_code: 'github_action' };
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await artifactSubdir('github');
      const kind = action === 'open_pr' ? 'pr' : 'issue';
      const fn = `${kind}_${invocation_id}.json`;
      const fp = path.join(dir, fn);
      await fs.writeFile(fp, JSON.stringify({ action, payload, invocation_id }, null, 2), 'utf8');
      return {
        ok: true,
        result_summary: `artifact: github/${action} → ${fp}`,
        artifact_path: fp,
      };
    },
  },

  supabase: {
    canExecuteLive(action, _payload, env) {
      if (action !== 'apply_sql') return false;
      const url = String(env.SUPABASE_URL || '').trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      return !!(url && key && isPlausibleSupabaseUrl(url));
    },
    async executeLive(action, payload, env) {
      const url = String(env.SUPABASE_URL || '').trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      const sql = String(payload.sql || payload.query || '').trim();
      if (!sql) return { ok: false, result_summary: 'apply_sql requires payload.sql', error_code: 'missing_sql' };
      if (!isPlausibleSupabaseUrl(url)) {
        return { ok: false, result_summary: 'SUPABASE_URL invalid', error_code: 'bad_supabase_url' };
      }
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc(SUPABASE_APPLY_SQL_RPC, { sql_text: sql });
      if (error) {
        return {
          ok: false,
          result_summary: `Supabase RPC ${SUPABASE_APPLY_SQL_RPC}: ${error.message}`.slice(0, 220),
          error_code: 'supabase_rpc_error',
          data: { hint: 'DB에 cos_apply_sql(sql_text) 함수 설치 필요 — supabase/migrations 참고' },
        };
      }
      return {
        ok: true,
        result_summary: `live: ${SUPABASE_APPLY_SQL_RPC} ok`,
        data: data ?? {},
      };
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await artifactSubdir('supabase');
      const fn = `sql_${invocation_id}.sql`;
      const fp = path.join(dir, fn);
      const sql = String(payload.sql || payload.query || '-- COS apply_sql payload\n');
      await fs.writeFile(fp, sql, 'utf8');
      return {
        ok: true,
        result_summary: `artifact: supabase/apply_sql → ${fp}`,
        artifact_path: fp,
      };
    },
  },

  vercel: {
    canExecuteLive() {
      return false;
    },
    async executeLive() {
      return { ok: false, result_summary: 'vercel artifact-only in this build', error_code: 'vercel_artifact_only' };
    },
    async buildArtifact(_action, payload, invocation_id) {
      const dir = await artifactSubdir('vercel');
      const fn = `deploy_${invocation_id}.json`;
      const fp = path.join(dir, fn);
      await fs.writeFile(fp, JSON.stringify({ payload, invocation_id }, null, 2), 'utf8');
      return {
        ok: true,
        result_summary: `artifact: vercel/deploy → ${fp}`,
        artifact_path: fp,
      };
    },
  },

  railway: {
    canExecuteLive(action, payload, env) {
      if (!String(env.RAILWAY_TOKEN || '').trim()) return false;
      if (action === 'deploy') return false;
      if (action === 'inspect_logs') {
        const dep = String(payload.deployment_id || env.RAILWAY_DEPLOYMENT_ID || '').trim();
        return !!dep;
      }
      return false;
    },
    async executeLive(action, payload, env) {
      const token = String(env.RAILWAY_TOKEN || '').trim();
      const deploymentId = String(payload.deployment_id || env.RAILWAY_DEPLOYMENT_ID || '').trim();
      if (action !== 'inspect_logs' || !deploymentId) {
        return { ok: false, result_summary: 'inspect_logs needs deployment_id', error_code: 'railway_no_deployment' };
      }
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `query { deploymentLogs(deploymentId: "${deploymentId}") { ... on DeploymentLog { message } } }`,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, result_summary: `railway graphql ${res.status}`, error_code: `railway_${res.status}` };
      }
      return {
        ok: true,
        result_summary: `live: railway logs fetched (${text.length}b)`,
        data: { raw: text.slice(0, 4000) },
      };
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await artifactSubdir('railway');
      const fn = `${action}_${invocation_id}.json`;
      const fp = path.join(dir, fn);
      await fs.writeFile(fp, JSON.stringify({ action, payload, invocation_id }, null, 2), 'utf8');
      let hint = '';
      if (action === 'inspect_logs') {
        hint = ' (set deployment_id + RAILWAY_TOKEN for live)';
      }
      return {
        ok: true,
        result_summary: `artifact: railway/${action} → ${fp}${hint}`,
        artifact_path: fp,
        next_required_input: action === 'inspect_logs' ? 'deployment_id' : null,
      };
    },
  },
};

/**
 * @param {Record<string, unknown>} spec
 * @param {{ threadKey?: string, packetId?: string, cosRunId?: string, ops_smoke_session_id?: string }} [ctx]
 */
export async function invokeExternalTool(spec, ctx = {}) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const threadKey = ctx.threadKey ? String(ctx.threadKey) : '';
  const runPacketId = ctx.packetId != null ? String(ctx.packetId).trim() : '';
  const cosRunId = ctx.cosRunId != null ? String(ctx.cosRunId).trim() : '';
  const tool = s.tool;
  const action = String(s.action || '').trim();
  let payload = s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {};

  if (!TOOL_ENUM.has(tool)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_tool',
      mode: 'external_tool_invocation',
    };
  }
  if (!isValidToolAction(tool, action)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_action',
      mode: 'external_tool_invocation',
    };
  }

  let delegateEmitPatchModule = null;
  let emitPatchMergedFromDelegate = false;
  if (tool === 'cursor' && action === 'emit_patch' && threadKey) {
    delegateEmitPatchModule = await loadDelegateEmitPatchStash();
    const merged = await mergeEmitPatchPayloadForDispatch(threadKey, payload);
    payload = merged.payload;
    emitPatchMergedFromDelegate = merged.mergedFromDelegate;
  }

  const invocation_id = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const adapter = TOOL_ADAPTERS[tool];
  const env = process.env;
  const opsSmokeSessionId =
    String(ctx.ops_smoke_session_id || '').trim() ||
    (isOpsSmokeEnabled(env) ? resolveSmokeSessionId(env) : null) ||
    (cosRunId && threadKey && isOpsSmokeEnabled(env) ? `smoke_inv_${invocation_id}` : null);

  let opsAttemptSeq = null;
  if (
    isOpsSmokeEnabled(env) &&
    opsSmokeSessionId &&
    cosRunId &&
    tool === 'cursor' &&
    (action === 'emit_patch' || action === 'create_spec')
  ) {
    const { bumpOpsSmokeAttemptSeq } = await import('./opsSmokeAttemptSeq.js');
    opsAttemptSeq = bumpOpsSmokeAttemptSeq(opsSmokeSessionId);
  }

  const readiness_snapshot = await getAdapterReadiness(tool, env, { threadKey });
  const snap = {
    tool: readiness_snapshot.tool,
    declared: readiness_snapshot.declared,
    live_capable: readiness_snapshot.live_capable,
    configured: readiness_snapshot.configured,
    details: readiness_snapshot.details,
  };

  if (tool === 'cursor' && action === 'create_spec' && threadKey) {
    const profile = getExecutionProfileForThread(threadKey);
    const pol = evaluateCursorActionAgainstProfile(profile, action);
    if (!pol.ok) {
      const status = 'blocked';
      const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
      const needs_review = true;
      const execution_mode = 'artifact';
      const result_summary = `blocked / policy / ${tool}:${action} — ${CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE} (profile=${profile.id})`;
      const ledgerPayload = {
        invocation_id,
        tool,
        action,
        execution_mode,
        execution_lane: 'artifact',
        status,
        artifact_path: null,
        next_required_input: null,
        error_code: 'policy_rejection',
        result_summary,
        outcome_code,
        live_attempted: false,
        readiness_snapshot: snap,
        fallback_reason: null,
        blocked_reason: CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE,
        degraded_from: null,
        needs_review,
        rejection_kind: REJECTION_KIND_EXECUTION_PROFILE,
        policy_rejection: true,
        execution_profile_id: profile.id,
        policy_rejection_code: pol.code,
        ...(runPacketId ? { run_packet_id: runPacketId } : {}),
        ...(cosRunId ? { cos_run_id: cosRunId } : {}),
      };
      const blockedCreateSpec = {
        ok: true,
        mode: 'external_tool_invocation',
        invocation_id,
        tool,
        action,
        accepted: true,
        execution_mode,
        execution_lane: 'artifact',
        status,
        outcome_code,
        payload,
        result_summary,
        artifact_path: null,
        next_required_input: null,
        needs_review,
        error_code: 'policy_rejection',
        rejection_kind: REJECTION_KIND_EXECUTION_PROFILE,
        policy_rejection: true,
        execution_profile_id: profile.id,
        policy_rejection_code: pol.code,
      };
      if (threadKey) {
        await appendExecutionArtifact(threadKey, {
          type: 'tool_invocation',
          summary: result_summary.slice(0, 500),
          status,
          needs_review,
          payload: ledgerPayload,
        });
        await appendExecutionArtifact(threadKey, {
          type: 'tool_result',
          summary: result_summary.slice(0, 500),
          status,
          needs_review,
          payload: ledgerPayload,
        });
      }
      return blockedCreateSpec;
    }
  }

  const automationLanePrecheck =
    tool === 'cursor' &&
    (action === 'create_spec' || action === 'emit_patch') &&
    isCursorCloudAgentLaneReady(env) &&
    __invokeToolTestHooks.failArtifactForTool !== tool;

  const liveOnlyNoFallbackEmitThread =
    Boolean(threadKey) &&
    Boolean(delegateEmitPatchModule) &&
    delegateEmitPatchModule.isThreadLiveOnlyNoFallbackSmoke(threadKey);
  const missingEmitPatchCloudContract = !emitPatchHasCloudContractSource(payload);
  const needsDelegateFirstEmitPatchBlock =
    tool === 'cursor' &&
    action === 'emit_patch' &&
    automationLanePrecheck &&
    missingEmitPatchCloudContract &&
    (liveOnlyNoFallbackEmitThread || !runPacketId);

  if (needsDelegateFirstEmitPatchBlock) {
    const blockedEmitReason = liveOnlyNoFallbackEmitThread
      ? DELEGATE_REQUIRED_BEFORE_EMIT_PATCH
      : DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH;
    const blockedEmitMachineHint = liveOnlyNoFallbackEmitThread
      ? 'live_only_emit_patch_requires_delegate_packets'
      : 'emit_patch_requires_delegate_merge_or_packet_scope';
    const profileForContract = threadKey ? getExecutionProfileForThread(threadKey) : getExecutionProfileForThread('');
    if (opsSmokeSessionId && cosRunId) {
      try {
        await recordCosPretriggerAudit({
          env,
          threadKey,
          runId: cosRunId,
          smoke_session_id: opsSmokeSessionId,
          call_name: 'invoke_external_tool',
          args: { tool, action, payload },
          blocked: true,
          blocked_reason: blockedEmitReason,
          machine_hint: blockedEmitMachineHint,
          missing_required_fields: ['packets', 'live_patch'],
          exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
          ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
        });
      } catch (e) {
        console.error('[pretrigger_audit]', e);
      }
    }
    const status = 'blocked';
    const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
    const needs_review = true;
    const execution_mode = 'artifact';
    const result_summary = `blocked / contract_source / ${tool}:${action} — ${blockedEmitReason} (${EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE})`;
    const ledgerPayload = {
      invocation_id,
      tool,
      action,
      execution_mode,
      execution_lane: 'artifact',
      status,
      artifact_path: null,
      next_required_input: null,
      error_code: 'missing_contract_source',
      result_summary,
      outcome_code,
      live_attempted: false,
      readiness_snapshot: snap,
      fallback_reason: null,
      blocked_reason: blockedEmitReason,
      degraded_from: null,
      needs_review,
      rejection_kind: REJECTION_KIND_MISSING_CONTRACT_SOURCE,
      exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
      execution_profile_id: profileForContract.id,
      ...(runPacketId ? { run_packet_id: runPacketId } : {}),
      ...(cosRunId ? { cos_run_id: cosRunId } : {}),
    };
    const blockedEarly = {
      ok: true,
      mode: 'external_tool_invocation',
      invocation_id,
      tool,
      action,
      accepted: true,
      execution_mode,
      execution_lane: 'artifact',
      status,
      outcome_code,
      payload,
      result_summary,
      artifact_path: null,
      next_required_input: null,
      needs_review,
      error_code: 'missing_contract_source',
      blocked_reason: blockedEmitReason,
      machine_hint: blockedEmitMachineHint,
      missing_required_fields: ['packets', 'live_patch'],
      rejection_kind: REJECTION_KIND_MISSING_CONTRACT_SOURCE,
      exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
      execution_profile_id: profileForContract.id,
      ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
    };
    if (threadKey) {
      await appendExecutionArtifact(threadKey, {
        type: 'tool_invocation',
        summary: result_summary.slice(0, 500),
        status,
        needs_review,
        payload: ledgerPayload,
      });
      await appendExecutionArtifact(threadKey, {
        type: 'tool_result',
        summary: result_summary.slice(0, 500),
        status,
        needs_review,
        payload: ledgerPayload,
      });
    }
    return blockedEarly;
  }

  if (opsSmokeSessionId && cosRunId) {
    try {
      await recordCosPretriggerAudit({
        env,
        threadKey,
        runId: cosRunId,
        smoke_session_id: opsSmokeSessionId,
        call_name: 'invoke_external_tool',
        args: { tool, action, payload },
        blocked: false,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[pretrigger_audit]', e);
    }
  }

  const block = toolInvocationBlocked(tool, action, payload, env);
  if (block.blocked) {
    if (opsSmokeSessionId && cosRunId) {
      try {
        await recordCosPretriggerAudit({
          env,
          threadKey,
          runId: cosRunId,
          smoke_session_id: opsSmokeSessionId,
          call_name: 'invoke_external_tool',
          args: { tool, action, payload },
          blocked: true,
          blocked_reason: 'tool_invocation_blocked',
          machine_hint: String(block.blocked_reason || '').slice(0, 300),
          missing_required_fields: block.next_required_input ? [String(block.next_required_input)] : null,
          ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
        });
      } catch (e) {
        console.error('[pretrigger_audit]', e);
      }
    }
    const status = 'blocked';
    const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
    const needs_review = true;
    const execution_mode = 'artifact';
    const result_summary = `blocked / artifact / ${tool}:${action} — ${String(block.blocked_reason || '').slice(0, 160)}`;
    const ledgerPayload = {
      invocation_id,
      tool,
      action,
      execution_mode,
      execution_lane: 'artifact',
      status,
      artifact_path: null,
      next_required_input: block.next_required_input ?? null,
      error_code: 'blocked_missing_input',
      result_summary,
      outcome_code,
      live_attempted: false,
      readiness_snapshot: snap,
      fallback_reason: null,
      blocked_reason: block.blocked_reason,
      degraded_from: null,
      needs_review,
      ...(runPacketId ? { run_packet_id: runPacketId } : {}),
      ...(cosRunId ? { cos_run_id: cosRunId } : {}),
    };
    const result = {
      ok: true,
      mode: 'external_tool_invocation',
      invocation_id,
      tool,
      action,
      accepted: true,
      execution_mode,
      execution_lane: 'artifact',
      status,
      outcome_code,
      payload,
      result_summary,
      artifact_path: null,
      next_required_input: block.next_required_input ?? null,
      needs_review,
      error_code: 'blocked_missing_input',
    };
    if (threadKey) {
      await appendExecutionArtifact(threadKey, {
        type: 'tool_invocation',
        summary: result_summary.slice(0, 500),
        status,
        needs_review,
        payload: ledgerPayload,
      });
      await appendExecutionArtifact(threadKey, {
        type: 'tool_result',
        summary: result_summary.slice(0, 500),
        status,
        needs_review,
        payload: ledgerPayload,
      });
    }
    return result;
  }

  let execution_mode = 'artifact';
  /** @type {'completed'|'degraded'|'blocked'|'failed'|'running'} */
  let status = 'failed';
  let outcome_code = TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD;
  let result_summary = '';
  let artifact_path = null;
  let next_required_input = null;
  let error_code = null;
  let live_attempted = false;
  let fallback_reason = null;
  const blocked_reason = null;
  let degraded_from = null;
  /** @type {'cloud_agent'|'local_cli'|'artifact'} */
  let execution_lane = 'artifact';

  const automationLane =
    tool === 'cursor' &&
    (action === 'create_spec' || action === 'emit_patch') &&
    isCursorCloudAgentLaneReady(env) &&
    __invokeToolTestHooks.failArtifactForTool !== tool;

  let automationLaneActive = automationLane;
  /** @type {null | ReturnType<import('./livePatchPayload.js').prepareEmitPatchForCloudAutomation>} */
  let emitPatchPrep = null;
  let emitPatchCloudSkippedForContract = false;

  if (tool === 'cursor' && action === 'emit_patch' && automationLane) {
    emitPatchPrep = compileEmitPatchForCloudAutomation(payload);
    payload = emitPatchPrep.payload;
    if (cosRunId && threadKey) {
      try {
        const { recordOpsSmokeEmitPatchCloudGate } = await import('./smokeOps.js');
        await recordOpsSmokeEmitPatchCloudGate({
          env,
          runId: cosRunId,
          threadKey,
          smoke_session_id: opsSmokeSessionId,
          prep: emitPatchPrep,
          merge_from_delegate: emitPatchMergedFromDelegate,
          ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
        });
      } catch (e) {
        console.error('[ops_smoke]', e);
      }
    }
    if (!emitPatchPrep.cloud_ok) {
      automationLaneActive = false;
      emitPatchCloudSkippedForContract = true;
      const asm = describeEmitPatchAssemblyBlock(emitPatchPrep, emitPatchMergedFromDelegate);
      const exactFailureCode = asm.exact_failure_code;
      const builderStage = asm.builder_stage_last_reached;
      const payloadProvenance = asm.payload_provenance;
      const machineHints = asm.machine_hints;
      if (opsSmokeSessionId && cosRunId) {
        try {
          await recordCosPretriggerAudit({
            env,
            threadKey,
            runId: cosRunId,
            smoke_session_id: opsSmokeSessionId,
            call_name: 'invoke_external_tool',
            args: { tool, action, payload },
            blocked: true,
            blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
            exact_failure_code: exactFailureCode,
            payload_provenance: payloadProvenance,
            builder_stage_last_reached: builderStage,
            machine_hint: machineHints[0] || exactFailureCode,
            missing_required_fields: emitPatchPrep.validation.missing_required_fields,
            ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
          });
        } catch (e) {
          console.error('[pretrigger_audit]', e);
        }
      }
      const status = 'blocked';
      const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
      const needs_review = true;
      const execution_mode = 'artifact';
      const result_summary = `blocked / assembly / ${tool}:${action} — ${EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD} (${exactFailureCode})`;
      const ledgerPayload = {
        invocation_id,
        tool,
        action,
        execution_mode,
        execution_lane: 'artifact',
        status,
        artifact_path: null,
        next_required_input: null,
        error_code: 'assembly_contract_not_met',
        result_summary,
        outcome_code,
        live_attempted: false,
        readiness_snapshot: snap,
        fallback_reason: null,
        blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
        exact_failure_code: exactFailureCode,
        payload_provenance: payloadProvenance,
        builder_stage_last_reached: builderStage,
        degraded_from: null,
        needs_review,
        rejection_kind: REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
        emit_patch_machine_hints: machineHints,
        ...(runPacketId ? { run_packet_id: runPacketId } : {}),
        ...(cosRunId ? { cos_run_id: cosRunId } : {}),
      };
      const blockedAssembly = {
        ok: true,
        mode: 'external_tool_invocation',
        invocation_id,
        tool,
        action,
        accepted: true,
        execution_mode,
        execution_lane: 'artifact',
        status,
        outcome_code,
        payload,
        result_summary,
        artifact_path: null,
        next_required_input: null,
        needs_review,
        error_code: 'assembly_contract_not_met',
        blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
        exact_failure_code: exactFailureCode,
        payload_provenance: payloadProvenance,
        builder_stage_last_reached: builderStage,
        machine_hint: machineHints[0] || exactFailureCode,
        missing_required_fields: emitPatchPrep.validation.missing_required_fields,
        emit_patch_machine_hints: machineHints,
        rejection_kind: REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      };
      if (threadKey) {
        await appendExecutionArtifact(threadKey, {
          type: 'tool_invocation',
          summary: result_summary.slice(0, 500),
          status,
          needs_review,
          payload: ledgerPayload,
        });
        await appendExecutionArtifact(threadKey, {
          type: 'tool_result',
          summary: result_summary.slice(0, 500),
          status,
          needs_review,
          payload: ledgerPayload,
        });
      }
      return blockedAssembly;
    }
  }

  const canLive =
    tool === 'cursor'
      ? await adapter.canExecuteLive(action, payload, env)
      : adapter.canExecuteLive(action, payload, env);

  async function runBuildArtifact() {
    if (__invokeToolTestHooks.failArtifactForTool === tool) {
      __invokeToolTestHooks.failArtifactForTool = null;
      return {
        ok: false,
        result_summary: 'artifact build failed (test hook)',
        artifact_path: null,
        next_required_input: null,
      };
    }
    return adapter.buildArtifact(action, payload, invocation_id);
  }

  /** @type {Record<string, unknown> | null} */
  let callbackContractSnapshot = null;
  let callbackMetadataPresent = false;
  /** @type {boolean | 'unknown'} */
  let callbackCapabilityObserved = 'unknown';
  let callbackOrchestratorStatus = null;
  let callbackOrchestratorAttempts = null;
  let callbackOrchestratorSyntheticPosts = null;
  let callbackDeliveryState = 'unknown';
  if (automationLaneActive && threadKey && cosRunId) {
    try {
      const { describeTriggerCallbackContractForOps } = await import('./cursorCloudAdapter.js');
      callbackContractSnapshot = describeTriggerCallbackContractForOps(env);
      callbackMetadataPresent = callbackContractSnapshot?.callback_contract_present === true;
      const { recordOpsSmokeTriggerCallbackContract } = await import('./smokeOps.js');
      await recordOpsSmokeTriggerCallbackContract({
        env,
        runId: cosRunId,
        threadKey,
        smoke_session_id: opsSmokeSessionId,
        invoked_tool: tool,
        invoked_action: action,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
  }

  const tr = automationLaneActive
    ? await triggerCursorAutomation({ action, payload, env, invocation_id })
    : null;

  if (automationLaneActive && tr && threadKey && cosRunId) {
    try {
      const { recordOpsSmokeCursorTrigger } = await import('./smokeOps.js');
      await recordOpsSmokeCursorTrigger({
        env,
        runId: cosRunId,
        threadKey,
        smoke_session_id: opsSmokeSessionId,
        tr: tr && typeof tr === 'object' ? /** @type {Record<string, unknown>} */ (tr) : null,
        invoked_tool: tool,
        invoked_action: action,
        callback_contract: callbackContractSnapshot,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
  }

  /** @type {Record<string, unknown> | null} */
  let cursorAutomationAudit = null;
  if (automationLaneActive && tr) {
    const acceptanceEchoHasCallbackMetadata = acceptanceResponseHasCallbackMetadataKeys(tr, env);
    callbackMetadataPresent = callbackMetadataPresent || acceptanceEchoHasCallbackMetadata;
    if (callbackMetadataPresent) callbackCapabilityObserved = true;
    cursorAutomationAudit = {
      trigger_status: tr.trigger_status,
      trigger_response_preview: tr.trigger_response_preview,
      external_run_id: tr.external_run_id,
      external_url: tr.external_url,
      cursor_automation_request_id: tr.request_id,
      cursor_automation_http_status: tr.status,
      automation_status_raw: tr.automation_status_raw ?? null,
      automation_branch_raw: tr.automation_branch_raw ?? null,
      callback_metadata_present: callbackMetadataPresent,
      callback_capability_observed: callbackCapabilityObserved,
    };
  }

  if (automationLaneActive && tr?.ok) {
    live_attempted = true;
    execution_lane = 'cloud_agent';
    try {
      const cloudRunId = String(tr.external_run_id || '').trim() || `cr_${invocation_id}`;
      let correlation_registered = false;
      if (threadKey) {
        const { recordCursorCloudCorrelation } = await import('./providerEventCorrelator.js');
        correlation_registered = await recordCursorCloudCorrelation({
          threadKey,
          packetId: runPacketId || undefined,
          cloudRunId,
          action,
          acceptedExternalId: String(tr.accepted_external_id || '').trim() || null,
          automationRequestId: String(tr.request_id || '').trim() || null,
          automationBranchRaw: tr.automation_branch_raw != null ? String(tr.automation_branch_raw) : null,
          payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
        });
      }
      if (isCursorAutomationSmokeMode(env)) {
        console.info(
          JSON.stringify({
            event: 'cos_cursor_automation_smoke',
            action,
            correlation_registered,
            has_external_run_id: Boolean(String(tr.external_run_id || '').trim()),
            invocation_tail: String(invocation_id).slice(-12),
          }),
        );
      }
      if (tool === 'cursor' && action === 'emit_patch' && cosRunId && threadKey) {
        try {
          const { registerRecoveryEnvelopeFromEmitPatchAccept } = await import('./resultRecoveryBridge.js');
          await registerRecoveryEnvelopeFromEmitPatchAccept({
            env,
            runId: cosRunId,
            threadKey,
            packetId: runPacketId != null && String(runPacketId).trim() ? String(runPacketId).trim() : null,
            acceptedExternalId:
              String(tr.accepted_external_id || '').trim() ||
              String(tr.external_run_id || '').trim() ||
              null,
            smoke_session_id: opsSmokeSessionId != null && String(opsSmokeSessionId).trim()
              ? String(opsSmokeSessionId).trim()
              : null,
            payload,
          });
        } catch (e) {
          console.error('[result_recovery_bridge]', e);
        }
      }
      if (tool === 'cursor' && cosRunId && threadKey) {
        try {
          const { awaitOrForceCallbackCompletion, shouldRunCallbackCompletionOrchestrator } = await import(
            './cursorCallbackCompletionOrchestrator.js'
          );
          const plForOrch =
            payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
          const shouldRunByLegacyRule = shouldRunCallbackCompletionOrchestrator(tool, action, plForOrch, env);
          const shouldRunByPrimaryCallbackPolicy =
            tool === 'cursor' &&
            action === 'emit_patch' &&
            callbackMetadataPresent &&
            (String(tr.request_id || '').trim().length > 0 || String(tr.accepted_external_id || '').trim().length > 0);
          if (shouldRunByLegacyRule || shouldRunByPrimaryCallbackPolicy) {
            const orch = await awaitOrForceCallbackCompletion({
              runId: cosRunId,
              threadKey,
              packetId: runPacketId != null && String(runPacketId).trim() ? String(runPacketId).trim() : null,
              action,
              requestId: String(tr.request_id || '').trim(),
              acceptedExternalId: String(tr.accepted_external_id || '').trim() || null,
              externalRunId: String(tr.external_run_id || '').trim() || null,
              payload: plForOrch,
              env,
            });
            callbackOrchestratorStatus = String(orch.status || '').trim() || null;
            callbackOrchestratorAttempts = orch.attempts != null ? Number(orch.attempts) : null;
            callbackOrchestratorSyntheticPosts =
              orch.synthetic_posts != null ? Number(orch.synthetic_posts) : null;
            callbackDeliveryState = mapOrchestratorStatusToDeliveryState(callbackOrchestratorStatus || '');
            if (callbackDeliveryState === 'unavailable') callbackCapabilityObserved = false;
            else if (callbackMetadataPresent) callbackCapabilityObserved = true;
            console.info(
              JSON.stringify({
                event: 'cos_cursor_callback_orchestrator',
                status: orch.status,
                attempts: orch.attempts,
                waited_ms: orch.waited_ms,
                synthetic_posts: orch.synthetic_posts,
              }),
            );
            try {
              const { recordOpsSmokePhase } = await import('./smokeOps.js');
              await recordOpsSmokePhase({
                env,
                runId: cosRunId,
                threadKey,
                smoke_session_id: opsSmokeSessionId,
                attempt_seq: opsAttemptSeq,
                phase:
                  callbackDeliveryState === 'delivered'
                    ? 'callback_orchestrator_delivery_observed'
                    : callbackDeliveryState === 'timeout'
                      ? 'callback_orchestrator_timeout'
                      : callbackDeliveryState === 'unavailable'
                        ? 'callback_orchestrator_unavailable'
                        : 'callback_orchestrator_pending',
                detail: {
                  callback_orchestrator_status: callbackOrchestratorStatus,
                  callback_delivery_state: callbackDeliveryState,
                  callback_metadata_present: callbackMetadataPresent,
                  callback_capability_observed: callbackCapabilityObserved,
                  callback_attempts: callbackOrchestratorAttempts,
                  callback_synthetic_posts: callbackOrchestratorSyntheticPosts,
                },
              });
            } catch (e) {
              console.error('[ops_smoke]', e);
            }
          } else if (callbackMetadataPresent) {
            callbackOrchestratorStatus = 'skipped_policy_gate';
            callbackDeliveryState = 'pending';
          }
        } catch (e) {
          console.error('[cursor_callback_orchestrator]', e);
          callbackOrchestratorStatus = 'orchestrator_exception';
          callbackDeliveryState = 'unknown';
          if (callbackMetadataPresent) callbackCapabilityObserved = true;
        }
      }
      if (cursorAutomationAudit) {
        cursorAutomationAudit = {
          ...cursorAutomationAudit,
          callback_metadata_present: callbackMetadataPresent,
          callback_capability_observed: callbackCapabilityObserved,
          callback_metadata_unavailable: !callbackMetadataPresent,
          callback_delivery_state: callbackDeliveryState,
          callback_orchestrator_status: callbackOrchestratorStatus,
          callback_orchestrator_attempts: callbackOrchestratorAttempts,
          callback_orchestrator_synthetic_posts: callbackOrchestratorSyntheticPosts,
        };
      }
      execution_mode = 'live';
      status = 'running';
      outcome_code = TOOL_OUTCOME_CODES.CLOUD_AGENT_DISPATCH_ACCEPTED;
      result_summary = `running / cloud_agent / cursor:${action} — dispatch accepted (${cloudRunId}); webhook completes`;
      artifact_path = null;
      next_required_input = null;

      const emitPatchClosureOrchestratorRan =
        tool === 'cursor' &&
        action === 'emit_patch' &&
        callbackOrchestratorStatus != null &&
        callbackOrchestratorStatus !== 'skipped_policy_gate';
      if (emitPatchClosureOrchestratorRan) {
        if (callbackDeliveryState === 'timeout') {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
          degraded_from = 'emit_patch_callback_timeout';
          error_code = 'emit_patch_callback_timeout';
          result_summary = `degraded / cloud_agent / cursor:emit_patch — dispatch accepted; signed callback not resolved within orchestrator window`;
        } else if (
          callbackDeliveryState === 'unavailable' &&
          ['skipped_no_contract', 'skipped_url_not_allowlisted', 'skipped_no_fetch'].includes(
            String(callbackOrchestratorStatus || ''),
          )
        ) {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
          degraded_from = 'emit_patch_callback_contract_unsatisfied';
          error_code = 'emit_patch_callback_contract_unsatisfied';
          result_summary = `degraded / cloud_agent / cursor:emit_patch — dispatch accepted but webhook closure contract cannot be satisfied`;
        }
      }
    } catch (e) {
      fallback_reason = String(e?.message || e).slice(0, 300);
      execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        degraded_from = 'cloud_dispatch_exception';
        result_summary = `degraded / artifact / ${tool}:${action} (cloud dispatch exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = 'cloud_dispatch_exception';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — cloud dispatch exception + artifact failed`;
        error_code = 'cloud_dispatch_exception';
      }
    }
  } else if (automationLaneActive && tr && !tr.ok) {
    live_attempted = true;
    fallback_reason = String(
      tr.error_code || tr.trigger_response_preview || tr.trigger_status || 'cursor_automation_failed',
    ).slice(0, 300);
    if (action === 'create_spec' && canLive) {
      execution_lane = 'local_cli';
      try {
        const lr = await adapter.executeLive(action, payload, env);
        if (lr.ok) {
          execution_mode = 'live';
          status = 'completed';
          outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
          result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
          artifact_path = lr.artifact_path ?? null;
          next_required_input = lr.next_required_input ?? null;
          if (
            threadKey &&
            tool === 'github' &&
            (action === 'create_issue' || action === 'open_pr') &&
            lr.data &&
            typeof lr.data === 'object'
          ) {
            try {
              const { recordGithubInvocationCorrelation } = await import('./providerEventCorrelator.js');
              await recordGithubInvocationCorrelation({
                threadKey,
                packetId: runPacketId,
                action,
                apiData: /** @type {Record<string, unknown>} */ (lr.data),
              });
            } catch (e) {
              console.error('[cos_github_correlation]', e);
            }
          }
        } else {
          fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
          const ar = await runBuildArtifact();
          execution_mode = 'artifact';
          execution_lane = 'artifact';
          if (ar.ok) {
            status = 'degraded';
            outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
            degraded_from = 'live_failure';
            result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
            artifact_path = ar.artifact_path ?? null;
            next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
            error_code = lr.error_code ?? null;
          } else {
            status = 'failed';
            outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
            result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
            error_code = lr.error_code ?? 'artifact_failed';
          }
        }
      } catch (e) {
        fallback_reason = String(e?.message || e).slice(0, 300);
        const ar = await runBuildArtifact();
        execution_mode = 'artifact';
        execution_lane = 'artifact';
        if (ar.ok) {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
          degraded_from = 'live_exception';
          result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
          artifact_path = ar.artifact_path ?? null;
          next_required_input = ar.next_required_input ?? null;
          error_code = 'live_exception';
        } else {
          status = 'failed';
          outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
          error_code = 'live_exception';
        }
      }
    } else {
      execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        degraded_from = 'cursor_automation_failed';
        result_summary = `degraded / artifact / ${tool}:${action} (cursor automation failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = tr.error_code ?? 'cursor_automation_failed';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — automation failed + artifact failed`;
        error_code = tr.error_code ?? 'cursor_automation_failed';
      }
    }
  } else if (canLive) {
    live_attempted = true;
    execution_lane = 'local_cli';
    try {
      const lr = await adapter.executeLive(action, payload, env);
      if (lr.ok) {
        execution_mode = 'live';
        status = 'completed';
        outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
        result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
        artifact_path = lr.artifact_path ?? null;
        next_required_input = lr.next_required_input ?? null;
        if (
          threadKey &&
          tool === 'github' &&
          (action === 'create_issue' || action === 'open_pr') &&
          lr.data &&
          typeof lr.data === 'object'
        ) {
          try {
            const { recordGithubInvocationCorrelation } = await import('./providerEventCorrelator.js');
            await recordGithubInvocationCorrelation({
              threadKey,
              packetId: runPacketId,
              action,
              apiData: /** @type {Record<string, unknown>} */ (lr.data),
            });
          } catch (e) {
            console.error('[cos_github_correlation]', e);
          }
        }
      } else {
        fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
        const ar = await runBuildArtifact();
        execution_mode = 'artifact';
        execution_lane = 'artifact';
        if (ar.ok) {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
          degraded_from = 'live_failure';
          result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
          artifact_path = ar.artifact_path ?? null;
          next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
          error_code = lr.error_code ?? null;
        } else {
          status = 'failed';
          outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
          error_code = lr.error_code ?? 'artifact_failed';
        }
      }
    } catch (e) {
      fallback_reason = String(e?.message || e).slice(0, 300);
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      execution_lane = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        degraded_from = 'live_exception';
        result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = 'live_exception';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
        error_code = 'live_exception';
      }
    }
  } else {
    live_attempted = false;
    execution_lane = 'artifact';
    const ar = await runBuildArtifact();
    if (ar.ok) {
      execution_mode = 'artifact';
      if (tool === 'cursor' && action === 'emit_patch' && emitPatchCloudSkippedForContract && emitPatchPrep) {
        const { formatEmitPatchCloudGateSummary } = await import('./livePatchPayload.js');
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        degraded_from = 'emit_patch_cloud_contract_not_met';
        const mis = emitPatchPrep.validation.missing_required_fields || [];
        result_summary = `${formatEmitPatchCloudGateSummary(emitPatchPrep)} — ${String(ar.result_summary || '').slice(0, 220)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = mis.length ? mis.slice(0, 8).join(',') : ar.next_required_input ?? null;
      } else {
        status = 'completed';
        outcome_code = TOOL_OUTCOME_CODES.ARTIFACT_PREPARED;
        result_summary = `completed / artifact / ${tool}:${action} — ${String(ar.result_summary || '').slice(0, 300)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
      }
    } else {
      execution_mode = 'artifact';
      status = 'failed';
      outcome_code = TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD;
      result_summary = `failed / artifact / ${tool}:${action} — artifact build failed`;
    }
  }

  const needs_review = status === 'degraded' || status === 'failed';

  /** @type {{ missing_required_fields: string[], emit_patch_machine_hints: string[] } | null} */
  let emitPatchFounderExtras = null;
  if (tool === 'cursor' && action === 'emit_patch' && emitPatchPrep && emitPatchCloudSkippedForContract) {
    const { formatEmitPatchMachineBlockedHints } = await import('./livePatchPayload.js');
    emitPatchFounderExtras = {
      missing_required_fields: (emitPatchPrep.validation.missing_required_fields || []).map(String).slice(0, 24),
      emit_patch_machine_hints: formatEmitPatchMachineBlockedHints(emitPatchPrep).slice(0, 12),
    };
  }

  const ledgerPayload = {
    invocation_id,
    tool,
    action,
    execution_mode,
    execution_lane,
    status,
    artifact_path,
    next_required_input,
    error_code,
    result_summary,
    outcome_code,
    live_attempted,
    readiness_snapshot: snap,
    fallback_reason,
    blocked_reason,
    degraded_from,
    needs_review,
    ...(runPacketId ? { run_packet_id: runPacketId } : {}),
    ...(cosRunId ? { cos_run_id: cosRunId } : {}),
    ...(cursorAutomationAudit || {}),
  };

  const result = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    execution_lane,
    status,
    outcome_code,
    payload,
    result_summary,
    artifact_path,
    next_required_input,
    needs_review,
    ...(error_code ? { error_code } : {}),
    ...(degraded_from ? { degraded_from } : {}),
    ...(emitPatchFounderExtras
      ? {
          missing_required_fields: emitPatchFounderExtras.missing_required_fields,
          emit_patch_machine_hints: emitPatchFounderExtras.emit_patch_machine_hints,
        }
      : {}),
    ...(cursorAutomationAudit
      ? {
          trigger_status: cursorAutomationAudit.trigger_status,
          external_run_id: cursorAutomationAudit.external_run_id,
          trigger_response_preview: cursorAutomationAudit.trigger_response_preview,
          cursor_automation_request_id: cursorAutomationAudit.cursor_automation_request_id,
          automation_status_raw: cursorAutomationAudit.automation_status_raw,
          automation_branch_raw: cursorAutomationAudit.automation_branch_raw,
          callback_metadata_present: cursorAutomationAudit.callback_metadata_present,
          callback_capability_observed: cursorAutomationAudit.callback_capability_observed,
          callback_metadata_unavailable: cursorAutomationAudit.callback_metadata_unavailable,
          callback_delivery_state: cursorAutomationAudit.callback_delivery_state,
          callback_orchestrator_status: cursorAutomationAudit.callback_orchestrator_status,
          callback_orchestrator_attempts: cursorAutomationAudit.callback_orchestrator_attempts,
          callback_orchestrator_synthetic_posts: cursorAutomationAudit.callback_orchestrator_synthetic_posts,
        }
      : {}),
  };

  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_invocation',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: ledgerPayload,
    });
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: ledgerPayload,
    });
  }

  return result;
}

/** Runtime plumbing — sync | webhook | polling (not founder/COS judgment). */
export const ADAPTER_RUNTIME_CAPS = {
  github: {
    create_issue: { completion_mode: 'webhook', callback_provider: 'github', correlation_required: true },
    open_pr: { completion_mode: 'webhook', callback_provider: 'github', correlation_required: true },
  },
  cursor: {
    create_spec: { completion_mode: 'webhook', callback_provider: 'cursor', correlation_required: false },
    emit_patch: { completion_mode: 'webhook', callback_provider: 'cursor', correlation_required: false },
  },
  supabase: {
    apply_sql: { completion_mode: 'sync', callback_provider: 'supabase', correlation_required: false },
  },
  railway: {
    inspect_logs: { completion_mode: 'sync', correlation_required: false },
    deploy: { completion_mode: 'polling', correlation_required: false },
  },
  vercel: {
    deploy: { completion_mode: 'polling', correlation_required: false },
  },
};
