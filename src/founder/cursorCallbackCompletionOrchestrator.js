/**
 * vNext.13.69 — Adapter-level callback completion: wait for provider, then signed synthetic POST.
 */

import { resolveCursorAutomationCallbackUrl } from './cursorCloudAdapter.js';
import { getRunById } from './executionRunStore.js';
import { listCosRunEventsForRun } from './runCosEvents.js';
import { computeEmitPatchPayloadPathFingerprint } from './cursorCallbackGate.js';
import { buildSyntheticCursorCompletionCallback, signCursorWebhookRawBody } from './cursorSyntheticCallback.js';
import { detectNarrowLivePatchFromPayload } from './livePatchPayload.js';

/** @type {Set<string>} */
const syntheticDedupeKeys = new Set();

/**
 * @type {{
 *   fetchImpl: ((input: string, init: RequestInit) => Promise<{ ok: boolean, status: number }>) | null,
 *   sleepMs: ((ms: number) => Promise<void>) | null,
 * }}
 */
export const __callbackOrchestratorTestHooks = {
  fetchImpl: null,
  sleepMs: null,
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} tool
 * @param {string} action
 * @param {Record<string, unknown>} payload
 */
export function shouldRunCallbackCompletionOrchestrator(tool, action, payload, env = process.env) {
  if (String(tool || '') !== 'cursor') return false;
  const flag = String(env.CURSOR_AUTOMATION_FORCE_CALLBACK_ON_PENDING || '').trim();
  if (flag === '0') return false;
  if (flag === '1') return true;
  if (String(action || '') !== 'emit_patch') return false;
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return Boolean(detectNarrowLivePatchFromPayload(pl));
}

/**
 * @param {string} url
 * @param {NodeJS.ProcessEnv} env
 */
function assertCallbackUrlAllowlisted(url, env) {
  const expected = resolveCursorAutomationCallbackUrl(env);
  if (!expected) throw new Error('cursor_callback_url_unconfigured');
  let a;
  let b;
  try {
    a = new URL(url);
    b = new URL(expected);
  } catch {
    throw new Error('cursor_callback_url_unparseable');
  }
  if (a.origin !== b.origin || a.pathname !== b.pathname) {
    throw new Error('cursor_callback_url_not_allowlisted');
  }
}

const TERMINAL_PACKET = new Set(['completed', 'failed', 'skipped', 'review_required']);

/**
 * @param {string | null | undefined} packetId
 * @param {Record<string, unknown> | null} run
 */
function packetLooksTerminal(packetId, run) {
  if (!run || !packetId) return false;
  const m = run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {};
  const st = String(m[String(packetId)] || '').trim();
  return TERMINAL_PACKET.has(st);
}

/**
 * @param {string} sk
 * @returns {'natural'|'synthetic'|'manual'}
 */
function classifyClosureSourceKind(sk) {
  const s = String(sk || '').trim().toLowerCase();
  if (s === 'synthetic_orchestrator') return 'synthetic';
  if (s === 'manual_probe') return 'manual';
  return 'natural';
}

/**
 * Latest Cursor closure discriminant from durable cos_run_events (ingress row when ops smoke on,
 * else external_* rows carrying cos_callback_closure_source — vNext.13.69).
 * @param {string} runId
 * @returns {Promise<'natural'|'synthetic'|'manual'|null>}
 */
async function latestCursorClosureKind(runId) {
  const rows = await listCosRunEventsForRun(String(runId), 500);
  let bestAt = '';
  /** @type {'natural'|'synthetic'|'manual'|null} */
  let best = null;
  for (const r of rows || []) {
    const et = String(r.event_type || '');
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const at = String(pl.occurred_at || pl.at || r.created_at || '');

    if (et === 'cos_cursor_webhook_ingress_safe') {
      if (String(pl.correlation_outcome || '') !== 'matched') continue;
      const k = classifyClosureSourceKind(pl.callback_source_kind);
      if (at >= bestAt) {
        bestAt = at;
        best = k;
      }
    }
    if (et === 'external_completed' || et === 'external_failed') {
      if (String(pl.canonical_provider || '') !== 'cursor') continue;
      const k = classifyClosureSourceKind(pl.cos_callback_closure_source);
      if (at >= bestAt) {
        bestAt = at;
        best = k;
      }
    }
  }
  return best;
}

async function sleep(ms) {
  const fn = __callbackOrchestratorTestHooks.sleepMs;
  if (fn) return fn(ms);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{
 *   runId: string,
 *   threadKey: string,
 *   packetId?: string | null,
 *   action: string,
 *   requestId: string,
 *   acceptedExternalId?: string | null,
 *   externalRunId?: string | null,
 *   payload: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} p
 * @returns {Promise<{
 *   status: string,
 *   attempts?: number,
 *   waited_ms?: number,
 *   synthetic_posts?: number,
 *   error?: string,
 * }>}
 */
export async function awaitOrForceCallbackCompletion(p) {
  const env = p.env || process.env;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  const requestId = String(p.requestId || '').trim();
  if (!runId || !threadKey || !requestId) {
    return { status: 'skipped_missing_inputs' };
  }

  const url = resolveCursorAutomationCallbackUrl(env);
  const secret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  if (!url || !secret) {
    return { status: 'skipped_no_contract' };
  }
  try {
    assertCallbackUrlAllowlisted(url, env);
  } catch (e) {
    return { status: 'skipped_url_not_allowlisted', error: String(e?.message || e).slice(0, 120) };
  }

  const timeoutSec = Number(String(env.CURSOR_AUTOMATION_FORCE_CALLBACK_TIMEOUT_SEC || '').trim());
  const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? Math.floor(timeoutSec * 1000) : 120_000;
  const maxAttempts = (() => {
    const n = Number(String(env.CURSOR_AUTOMATION_FORCE_CALLBACK_MAX_ATTEMPTS || '').trim());
    return Number.isFinite(n) && n > 0 ? Math.min(12, Math.floor(n)) : 4;
  })();
  const pollMs = 400;

  const pl = p.payload && typeof p.payload === 'object' && !Array.isArray(p.payload) ? p.payload : {};
  const pathFp = String(p.action || '') === 'emit_patch' ? computeEmitPatchPayloadPathFingerprint(pl) : '';
  const dedupeKey = `${runId}|${requestId}|${pathFp || 'nopath'}`;
  if (syntheticDedupeKeys.has(dedupeKey)) {
    return { status: 'skipped_idempotent', waited_ms: 0, synthetic_posts: 0 };
  }

  const k0 = await latestCursorClosureKind(runId);
  if (k0 === 'synthetic') {
    return { status: 'synthetic_callback_matched', waited_ms: 0, attempts: 0, synthetic_posts: 0 };
  }
  if (k0 === 'natural') {
    return { status: 'provider_callback_matched', waited_ms: 0, attempts: 0, synthetic_posts: 0 };
  }
  if (k0 === 'manual') {
    return { status: 'manual_probe_closure_observed', waited_ms: 0, attempts: 0, synthetic_posts: 0 };
  }

  const naturalWindowMs = Math.min(15_000, Math.max(2000, Math.floor(timeoutMs * 0.25)));
  let waited = 0;
  while (waited < naturalWindowMs) {
    const k = await latestCursorClosureKind(runId);
    if (k === 'natural') {
      return { status: 'provider_callback_matched', waited_ms: waited, attempts: 0, synthetic_posts: 0 };
    }
    if (k === 'synthetic') {
      return { status: 'synthetic_callback_matched', waited_ms: waited, attempts: 0, synthetic_posts: 0 };
    }
    if (k === 'manual') {
      return { status: 'manual_probe_closure_observed', waited_ms: waited, attempts: 0, synthetic_posts: 0 };
    }
    await sleep(pollMs);
    waited += pollMs;
  }

  let syntheticPosts = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const kLoop = await latestCursorClosureKind(runId);
    if (kLoop === 'natural') {
      return {
        status: 'provider_callback_matched',
        waited_ms: waited,
        attempts: attempt,
        synthetic_posts: syntheticPosts,
      };
    }
    if (kLoop === 'synthetic') {
      return {
        status: 'synthetic_callback_matched',
        waited_ms: waited,
        attempts: attempt,
        synthetic_posts: syntheticPosts,
      };
    }
    if (kLoop === 'manual') {
      return {
        status: 'manual_probe_closure_observed',
        waited_ms: waited,
        attempts: attempt,
        synthetic_posts: syntheticPosts,
      };
    }
    const run = await getRunById(runId);
    if (packetLooksTerminal(p.packetId, run)) {
      const nat2 = await latestMatchedIngressSourceKind(runId, 'natural');
      if (nat2) {
        return { status: 'provider_callback_matched', waited_ms: waited, attempts: attempt, synthetic_posts: syntheticPosts };
      }
    }

    const bodyObj = buildSyntheticCursorCompletionCallback({
      requestId,
      acceptedExternalId: p.acceptedExternalId,
      externalRunId: p.externalRunId,
      threadKey,
      packetId: p.packetId,
      payload: pl,
    });
    const rawBody = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const sig = signCursorWebhookRawBody(secret, rawBody);

    const fetchFn = __callbackOrchestratorTestHooks.fetchImpl || globalThis.fetch?.bind(globalThis);
    if (typeof fetchFn !== 'function') {
      return { status: 'skipped_no_fetch', attempts: attempt, synthetic_posts: syntheticPosts };
    }

    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cursor-signature-256': sig,
          'x-cos-callback-source': 'synthetic_orchestrator',
        },
        body: rawBody,
      });
      syntheticPosts += 1;
      const ok = res && res.ok === true && Number(res.status) === 200;
      if (ok) {
        syntheticDedupeKeys.add(dedupeKey);
        await sleep(50);
        const kSyn = await latestCursorClosureKind(runId);
        if (kSyn === 'synthetic') {
          return { status: 'synthetic_callback_matched', waited_ms: waited, attempts: attempt + 1, synthetic_posts: syntheticPosts };
        }
        const runAfter = await getRunById(runId);
        if (packetLooksTerminal(p.packetId, runAfter)) {
          return { status: 'synthetic_callback_matched', waited_ms: waited, attempts: attempt + 1, synthetic_posts: syntheticPosts };
        }
      }
    } catch (e) {
      console.error('[cursor_callback_orchestrator]', e);
    }

    const backoff = Math.min(8000, 400 * 2 ** attempt);
    await sleep(backoff);
    waited += backoff;
    if (waited >= timeoutMs) break;
  }

  return {
    status: 'callback_timeout',
    waited_ms: waited,
    attempts: maxAttempts,
    synthetic_posts: syntheticPosts,
  };
}

export function __resetCallbackOrchestratorDedupeForTests() {
  syntheticDedupeKeys.clear();
}
