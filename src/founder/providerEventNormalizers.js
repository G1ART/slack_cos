/**
 * Provider webhook → canonical external event (runtime plumbing only).
 */

import crypto from 'node:crypto';

export const GITHUB_WEBHOOK_ALLOWED_EVENTS = new Set([
  'issues',
  'pull_request',
  'check_suite',
  'check_run',
  'workflow_run',
  'push',
]);

/**
 * @param {string} secret
 * @param {Buffer | string} rawBody
 * @param {string | undefined} signature256Header
 */
export function verifyGithubWebhookSignature(secret, rawBody, signature256Header) {
  const s = String(secret || '').trim();
  if (!s || !signature256Header) return false;
  const sig = String(signature256Header).trim();
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const hmac = crypto.createHmac('sha256', s).update(buf).digest('hex');
  const expected = `sha256=${hmac}`;
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} headers lower-case keys
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown> | null}
 */
export function normalizeGithubWebhookPayload(headers, body) {
  const event = String(headers['x-github-event'] || '').trim();
  if (!GITHUB_WEBHOOK_ALLOWED_EVENTS.has(event)) return null;

  const repo = body.repository && typeof body.repository === 'object' ? body.repository : {};
  const fullName = String(repo.full_name || '');
  const received_at = new Date().toISOString();

  if (event === 'issues') {
    const issue = body.issue && typeof body.issue === 'object' ? body.issue : null;
    if (!issue || issue.number == null) return null;
    const action = String(body.action || 'unknown');
    const num = issue.number;
    return {
      provider: 'github',
      event_type: `issues.${action}`,
      external_id: `${fullName}#${num}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'issue',
        object_id: String(num),
      },
      status_hint: action === 'closed' ? 'external_completed' : 'external_status_update',
      raw_summary: `issues/${action} #${num} ${String(issue.title || '').slice(0, 80)}`,
      payload: {
        action,
        issue: { number: issue.number, state: issue.state, title: issue.title },
      },
      received_at,
    };
  }

  if (event === 'pull_request') {
    const pr = body.pull_request && typeof body.pull_request === 'object' ? body.pull_request : null;
    if (!pr || pr.number == null) return null;
    const action = String(body.action || 'unknown');
    const num = pr.number;
    let status_hint = 'external_status_update';
    if (action === 'closed' && pr.merged === true) status_hint = 'external_completed';
    else if (action === 'closed') status_hint = 'external_failed';
    return {
      provider: 'github',
      event_type: `pull_request.${action}`,
      external_id: `${fullName}#${num}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'pull_request',
        object_id: String(num),
      },
      status_hint,
      raw_summary: `pull_request/${action} #${num}`,
      payload: {
        action,
        pull_request: { number: pr.number, merged: pr.merged, state: pr.state },
      },
      received_at,
    };
  }

  if (event === 'check_suite') {
    const suite = body.check_suite && typeof body.check_suite === 'object' ? body.check_suite : {};
    const action = String(body.action || 'unknown');
    const id = suite.id != null ? String(suite.id) : action;
    return {
      provider: 'github',
      event_type: `check_suite.${action}`,
      external_id: `${fullName}:check_suite:${id}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'check_suite',
        object_id: id,
      },
      status_hint: 'external_status_update',
      raw_summary: `check_suite.${action}`,
      payload: { action, check_suite: { id: suite.id, status: suite.status, conclusion: suite.conclusion } },
      received_at,
    };
  }

  if (event === 'check_run') {
    const cr = body.check_run && typeof body.check_run === 'object' ? body.check_run : {};
    const action = String(body.action || 'unknown');
    const id = cr.id != null ? String(cr.id) : action;
    return {
      provider: 'github',
      event_type: `check_run.${action}`,
      external_id: `${fullName}:check_run:${id}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'check_run',
        object_id: id,
      },
      status_hint: 'external_status_update',
      raw_summary: `check_run.${action}`,
      payload: { action, check_run: { id: cr.id, status: cr.status, conclusion: cr.conclusion } },
      received_at,
    };
  }

  if (event === 'workflow_run') {
    const wr = body.workflow_run && typeof body.workflow_run === 'object' ? body.workflow_run : {};
    const action = String(body.action || 'unknown');
    const id = wr.id != null ? String(wr.id) : action;
    return {
      provider: 'github',
      event_type: `workflow_run.${action}`,
      external_id: `${fullName}:workflow_run:${id}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'workflow_run',
        object_id: id,
      },
      status_hint: 'external_status_update',
      raw_summary: `workflow_run.${action}`,
      payload: { action, workflow_run: { id: wr.id, status: wr.status, conclusion: wr.conclusion } },
      received_at,
    };
  }

  if (event === 'push') {
    const head = body.head_commit && typeof body.head_commit === 'object' ? body.head_commit : {};
    const sha = String(head.id || body.after || '').trim();
    if (!sha) return null;
    const ref = String(body.ref || '').trim();
    const commits = Array.isArray(body.commits) ? body.commits : [];
    /** @type {Set<string>} */
    const pathsTouched = new Set();
    for (const c of commits) {
      if (!c || typeof c !== 'object') continue;
      for (const k of /** @type {const} */ (['added', 'modified', 'removed'])) {
        const arr = Array.isArray(c[k]) ? c[k] : [];
        for (const p of arr) pathsTouched.add(String(p));
      }
    }
    return {
      provider: 'github',
      event_type: 'push',
      external_id: `${fullName}:push:${sha.slice(0, 12)}`,
      correlation_keys: {
        repository_full_name: fullName,
        object_type: 'push',
        object_id: sha,
      },
      status_hint: 'external_status_update',
      raw_summary: `push ${ref || '(no ref)'} ${sha.slice(0, 7)}`,
      payload: {
        ref: ref || null,
        head_sha: sha,
        paths_touched: [...pathsTouched],
      },
      received_at,
    };
  }

  return null;
}

/**
 * @param {string | undefined} repoFullName from payload.repository.full_name
 * @param {NodeJS.ProcessEnv} env
 */
export function githubRepoMatchesConfigured(repoFullName, env) {
  const e = env || process.env;
  const fromRepo = String(e.GITHUB_REPOSITORY || '').trim();
  const owner = String(e.GITHUB_DEFAULT_OWNER || '').trim();
  const repoName = String(e.GITHUB_DEFAULT_REPO || '').trim();
  const cfg = fromRepo || (owner && repoName ? `${owner}/${repoName}` : '');
  if (!cfg || !repoFullName) return false;
  return cfg.toLowerCase() === String(repoFullName).toLowerCase();
}
