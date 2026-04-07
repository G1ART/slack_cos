/**
 * GitHub webhook follow-on: connectivity check to api.github.com for push/issues/pull_request only.
 */

import {
  resolveGithubToken,
  parseGithubRepoFromEnv,
  resolveGithubRepositorySource,
  resolveGithubTokenSource,
} from './toolsBridge.js';

const FOLLOW_ON_EVENTS = new Set(['push', 'issues', 'pull_request']);

/** Events that record X-GitHub-Delivery dedupe (Supabase/memory/file). */
export const GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS = FOLLOW_ON_EVENTS;

/**
 * @param {string | undefined} event
 */
export function shouldGithubWebhookFollowOn(event) {
  return FOLLOW_ON_EVENTS.has(String(event || '').trim());
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} eventType x-github-event header
 */
export async function githubWebhookFollowOnFetch(env, eventType) {
  const et = String(eventType || '').trim();
  if (!shouldGithubWebhookFollowOn(et)) return { skipped: true, reason: 'event_not_follow_on_target' };

  const token = resolveGithubToken(env);
  const parsed = parseGithubRepoFromEnv(env);
  const token_present = Boolean(token);
  const token_source = resolveGithubTokenSource(env);
  const repo_source = resolveGithubRepositorySource(env);
  const request_path = parsed ? `/repos/${parsed.owner}/${parsed.repo}` : null;

  if (!token || !parsed) {
    console.info(
      JSON.stringify({
        event: 'github_webhook_follow_on',
        outcome: 'skipped',
        reason: 'missing_token_or_repo',
        provider: 'github',
        event_type: et,
        token_present,
        token_source,
        repo_resolution_source: repo_source,
        request_path,
      }),
    );
    return { skipped: true, reason: 'missing_token_or_repo' };
  }

  const url = `https://api.github.com${request_path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      let response_preview = '';
      try {
        response_preview = (await res.text()).slice(0, 200);
      } catch {
        response_preview = '';
      }
      console.error(
        JSON.stringify({
          event: 'github_webhook_follow_on',
          outcome: 'http_error',
          status: res.status,
          provider: 'github',
          event_type: et,
          token_present: true,
          token_source,
          repo_resolution_source: repo_source,
          request_path,
          response_preview: response_preview || undefined,
        }),
      );
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const cause =
      err.cause instanceof Error
        ? err.cause.message
        : err.cause != null
          ? String(err.cause)
          : undefined;
    console.error(
      JSON.stringify({
        event: 'github_webhook_follow_on',
        outcome: 'fetch_thrown',
        status: null,
        provider: 'github',
        event_type: et,
        token_present: true,
        token_source,
        repo_resolution_source: repo_source,
        request_path,
        error_name: err.name,
        error_message: err.message,
        cause: cause || undefined,
      }),
    );
    return { ok: false, thrown: true };
  }
}
