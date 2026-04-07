/**
 * 외부 툴 TOOL_ADAPTERS — live는 실제 호출 가능할 때만, 그 외 artifact(파일 기록).
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appendExecutionArtifact, cosRuntimeBaseDir } from './executionLedger.js';

const TOOL_ENUM = new Set(['cursor', 'github', 'supabase', 'vercel', 'railway']);

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

const TOOL_ADAPTERS = {
  cursor: {
    /** @param {string} action @param {object} payload @param {NodeJS.ProcessEnv} env */
    canExecuteLive(_action, _payload, _env) {
      return false;
    },
    async executeLive() {
      return { ok: false, result_summary: 'cursor is artifact-only', error_code: 'cursor_no_live' };
    },
    /** @param {string} action @param {object} payload @param {string} invocation_id */
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
    canExecuteLive() {
      return false;
    },
    async executeLive() {
      return { ok: false, result_summary: 'supabase live disabled (no service-role execution)', error_code: 'supabase_artifact_only' };
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

  const canLive = adapter.canExecuteLive(action, payload, env);

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
        result_summary = ar.result_summary;
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
