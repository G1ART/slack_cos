/**
 * GitHub REST external tool lane (issues, PRs) + shared credential helpers.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { cosToolArtifactSubdir } from '../artifactSubdir.js';

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

export async function getGithubAdapterReadiness(env = process.env, _options = {}) {
  const e = env || process.env;
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

export function githubInvocationPrecheck(action, payload, env) {
  const e = env || process.env;
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
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
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

export const githubToolAdapter = {
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
      const dir = await cosToolArtifactSubdir('github');
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
};
