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
import { appendExecutionArtifact, cosRuntimeBaseDir } from './executionLedger.js';

const execFileAsync = promisify(execFile);

/** 테스트 전용: Cursor live 경로의 execFile 대체 (@param {typeof execFileAsync | null} fn */
export const __cursorExecFileForTests = { fn: /** @type {typeof execFileAsync | null} */ (null) };

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

/** PostgREST RPC 이름 — DB에 함수가 있어야 apply_sql live 성공 */
export const SUPABASE_APPLY_SQL_RPC = 'cos_apply_sql';

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
 * @param {Record<string, string | undefined>} env
 */
function parseGithubRepo(env) {
  const r = String(env.GITHUB_REPOSITORY || '').trim();
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
 * @property {boolean} live_capable
 * @property {boolean} configured
 * @property {string} reason
 * @property {string[]} missing
 * @property {Record<string, unknown>} details
 */

/**
 * @param {string} tool
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<AdapterReadiness>}
 */
export async function getAdapterReadiness(tool, env = process.env) {
  const e = env || process.env;

  if (tool === 'github') {
    const token = String(e.GITHUB_TOKEN || '').trim();
    const repoRaw = String(e.GITHUB_REPOSITORY || '').trim();
    const repo = parseGithubRepo(e);
    const missing = [];
    if (!token) missing.push('GITHUB_TOKEN');
    if (!repoRaw) missing.push('GITHUB_REPOSITORY');
    else if (!repo) missing.push('GITHUB_REPOSITORY(parse: need owner/repo)');
    const configured = !!token && !!repo;
    const live_capable = configured;
    const reason = live_capable
      ? 'token+repo OK → REST live 가능'
      : !token
        ? '토큰 없음 → artifact'
        : !repoRaw
          ? 'GITHUB_REPOSITORY 없음 → artifact'
          : 'GITHUB_REPOSITORY 형식 오류(owner/repo) → artifact';
    return {
      tool: 'github',
      live_capable,
      configured: !!token || !!repoRaw,
      reason,
      missing,
      details: { has_token: !!token, repo_parse_ok: !!repo, repository: repoRaw || null },
    };
  }

  if (tool === 'supabase') {
    const url = String(e.SUPABASE_URL || '').trim();
    const key = String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    const urlOk = url && isPlausibleSupabaseUrl(url);
    if (url && !urlOk) missing.push('SUPABASE_URL(invalid)');
    const configured = !!url && !!key && urlOk;
    const live_capable = configured;
    const reason = live_capable
      ? `service-role 클라이언트 + RPC ${SUPABASE_APPLY_SQL_RPC} 호출 시도 (DB에 함수 필요)`
      : '자격·URL 부족 → artifact';
    return {
      tool: 'supabase',
      live_capable,
      configured: !!url || !!key,
      reason,
      missing,
      details: {
        url_present: !!url,
        url_valid: urlOk,
        service_role_present: !!key,
        rpc: SUPABASE_APPLY_SQL_RPC,
      },
    };
  }

  if (tool === 'cursor') {
    const cliPath = await resolveCursorCliPath(e);
    const cwd = cursorProjectDir(e);
    const cwdOk = await isDir(cwd);
    const missing = [];
    if (!cliPath) missing.push('CURSOR_CLI_BIN 또는 PATH의 agent|cursor-agent');
    if (!cwdOk) missing.push('CURSOR_PROJECT_DIR(존재하는 디렉터리)');
    const live_capable = !!cliPath && cwdOk;
    const reason = live_capable
      ? 'CLI+cwd OK → create_spec live 시도 가능 (emit_patch는 artifact-only)'
      : !cliPath
        ? 'Cursor CLI 없음 → artifact-only'
        : '작업 디렉터리 없음 → artifact-only';
    return {
      tool: 'cursor',
      live_capable,
      configured: !!cliPath || !!String(e.CURSOR_CLI_BIN || '').trim(),
      reason,
      missing,
      details: {
        cli_path: cliPath,
        cwd,
        cwd_ok: cwdOk,
        live_actions: ['create_spec'],
        artifact_actions: ['emit_patch'],
      },
    };
  }

  if (tool === 'railway') {
    const token = String(e.RAILWAY_TOKEN || '').trim();
    const dep = String(e.RAILWAY_DEPLOYMENT_ID || '').trim();
    const missing = [];
    if (!token) missing.push('RAILWAY_TOKEN');
    if (!dep) missing.push('RAILWAY_DEPLOYMENT_ID 또는 payload.deployment_id');
    const inspectReady = !!token;
    const inspectLiveCapable = !!token && !!dep;
    const reason = `inspect_logs: ${inspectLiveCapable ? 'live 가능(deployment_id 있음)' : token ? 'deployment_id 필요' : '토큰 없음'}; deploy: 비활성`;
    return {
      tool: 'railway',
      live_capable: inspectLiveCapable,
      configured: !!token,
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
      live_capable: false,
      configured: false,
      reason: 'vercel live 미구현 → 항상 artifact',
      missing: [],
      details: { deploy_live: false },
    };
  }

  return {
    tool: String(tool),
    live_capable: false,
    configured: false,
    reason: 'unknown tool',
    missing: [],
    details: {},
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<AdapterReadiness[]>}
 */
export async function getAllAdapterReadiness(env = process.env) {
  const tools = ['github', 'supabase', 'cursor', 'railway', 'vercel'];
  const out = [];
  for (const t of tools) {
    out.push(await getAdapterReadiness(t, env));
  }
  return out;
}

/**
 * COS 시스템 입력용 1줄 요약 (최대 6줄 권장).
 * @param {AdapterReadiness} r
 */
export function formatAdapterReadinessOneLine(r) {
  if (r.tool === 'github') {
    return `github: ${r.live_capable ? 'live-ready' : 'artifact'} — ${r.reason}`;
  }
  if (r.tool === 'supabase') {
    return `supabase: ${r.live_capable ? 'live-ready(apply_sql→rpc)' : 'artifact'} — ${r.reason}`;
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
 * @returns {Promise<string[]>}
 */
export async function formatAdapterReadinessCompactLines(env = process.env, max = 6) {
  const all = await getAllAdapterReadiness(env);
  return all.map(formatAdapterReadinessOneLine).slice(0, max);
}

const TOOL_ADAPTERS = {
  cursor: {
    /** @param {string} action */
    async canExecuteLive(action, _payload, env) {
      if (action !== 'create_spec') return false;
      const r = await getAdapterReadiness('cursor', env);
      return r.live_capable;
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
      if (!String(env.GITHUB_TOKEN || '').trim()) return false;
      if (!parseGithubRepo(env)) return false;
      if (action === 'create_issue') return true;
      if (action === 'open_pr') return true;
      return false;
    },
    async executeLive(action, payload, env) {
      const token = String(env.GITHUB_TOKEN || '').trim();
      const repo = parseGithubRepo(env);
      if (!repo) return { ok: false, result_summary: 'GITHUB_REPOSITORY missing', error_code: 'no_repo' };

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
 * @param {{ threadKey?: string }} [ctx]
 */
export async function invokeExternalTool(spec, ctx = {}) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const threadKey = ctx.threadKey ? String(ctx.threadKey) : '';
  const tool = s.tool;
  const action = String(s.action || '').trim();
  const payload = s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {};

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

  const invocation_id = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const adapter = TOOL_ADAPTERS[tool];
  const env = process.env;

  let execution_mode = 'artifact';
  let status = 'failed';
  let result_summary = '';
  let artifact_path = null;
  let next_required_input = null;
  let error_code = null;

  const canLive =
    tool === 'cursor'
      ? await adapter.canExecuteLive(action, payload, env)
      : adapter.canExecuteLive(action, payload, env);

  if (canLive) {
    try {
      const lr = await adapter.executeLive(action, payload, env);
      if (lr.ok) {
        execution_mode = 'live';
        status = 'completed';
        result_summary = lr.result_summary;
        artifact_path = lr.artifact_path ?? null;
        next_required_input = lr.next_required_input ?? null;
      } else {
        const ar = await adapter.buildArtifact(action, payload, invocation_id);
        execution_mode = 'artifact';
        status = 'completed';
        result_summary = `${ar.result_summary} (live failed: ${lr.result_summary.slice(0, 120)})`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
        error_code = lr.error_code ?? null;
      }
    } catch (e) {
      const ar = await adapter.buildArtifact(action, payload, invocation_id);
      execution_mode = 'artifact';
      status = 'completed';
      result_summary = `${ar.result_summary} (live error: ${String(e?.message || e).slice(0, 120)})`;
      artifact_path = ar.artifact_path ?? null;
      next_required_input = ar.next_required_input ?? null;
      error_code = 'live_exception';
    }
  } else {
    const ar = await adapter.buildArtifact(action, payload, invocation_id);
    execution_mode = 'artifact';
    status = 'completed';
    result_summary = ar.result_summary;
    artifact_path = ar.artifact_path ?? null;
    next_required_input = ar.next_required_input ?? null;
  }

  const result = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    status,
    payload,
    result_summary,
    artifact_path,
    next_required_input,
    ...(error_code ? { error_code } : {}),
  };

  const ledgerPayload = {
    invocation_id,
    tool,
    action,
    execution_mode,
    status,
    artifact_path,
    next_required_input,
    error_code,
    result_summary,
  };

  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_invocation',
      summary: `${invocation_id} ${tool}/${action} / ${execution_mode} / ${status}`,
      status,
      needs_review: status === 'failed',
      payload: ledgerPayload,
    });
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: result_summary.slice(0, 500),
      status,
      needs_review: status === 'failed',
      payload: ledgerPayload,
    });
  }

  return result;
}
