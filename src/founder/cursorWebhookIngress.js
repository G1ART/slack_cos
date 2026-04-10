/**
 * Cursor Cloud Agent webhook verify + payload normalization (runtime plumbing).
 * Webhook-only dot-path overrides via CURSOR_WEBHOOK_*_PATH env (see listCursorWebhookOverrideKeys).
 */

import crypto from 'node:crypto';
import { getByDotPath } from './cursorCloudAdapter.js';
import { canonicalizeExternalRunStatus } from './externalRunStatus.js';
import { computePathsArrayFingerprint } from './cursorCallbackGate.js';

export const CURSOR_WEBHOOK_OVERRIDE_ENV_KEYS = [
  'CURSOR_WEBHOOK_RUN_ID_PATH',
  'CURSOR_WEBHOOK_STATUS_PATH',
  'CURSOR_WEBHOOK_THREAD_KEY_PATH',
  'CURSOR_WEBHOOK_PACKET_ID_PATH',
  'CURSOR_WEBHOOK_ACCEPTED_ID_PATH',
  'CURSOR_WEBHOOK_BRANCH_PATH',
  'CURSOR_WEBHOOK_PR_URL_PATH',
  'CURSOR_WEBHOOK_SUMMARY_PATH',
  'CURSOR_WEBHOOK_OCCURRED_AT_PATH',
];

/** @param {NodeJS.ProcessEnv} [env] */
export function listCursorWebhookOverrideKeys(env = process.env) {
  const keys = [];
  for (const k of CURSOR_WEBHOOK_OVERRIDE_ENV_KEYS) {
    if (String(env[k] || '').trim()) keys.push(k);
  }
  return keys;
}

/**
 * @param {string} secret
 * @param {Buffer} rawBody
 * @param {string | undefined} signature256Header
 */
export function verifyCursorWebhookSignature(secret, rawBody, signature256Header) {
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

/** @param {unknown} x */
function asRecord(x) {
  return x && typeof x === 'object' && !Array.isArray(x) ? /** @type {Record<string, unknown>} */ (x) : {};
}

/** @param {unknown[]} values */
function firstNonEmptyString(values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * @param {Record<string, unknown>} root
 * @param {string} envKey
 * @param {NodeJS.ProcessEnv} env
 * @param {() => { value: string, trace: string }} heuristic
 * @param {string[]} selectedKeysOut
 */
function pickString(root, envKey, env, heuristic, selectedKeysOut) {
  const path = String(env[envKey] || '').trim();
  if (path) {
    const v = getByDotPath(root, path);
    if (v != null && String(v).trim()) {
      selectedKeysOut.push(envKey);
      return { value: String(v).trim(), source: envKey };
    }
  }
  const h = heuristic();
  return { value: h.value, source: h.trace };
}

/**
 * Shared field picks for normalization + safe ingress snapshots (vNext.13.52+).
 * @param {Record<string, unknown>} body
 * @param {NodeJS.ProcessEnv} [env]
 */
export function computeCursorWebhookFieldSelection(body, env = process.env) {
  const root = asRecord(body);
  const nested = asRecord(root.payload);
  const context = asRecord(root.context);
  const data = asRecord(root.data);
  const job = asRecord(root.job);
  const agent = asRecord(root.agent);
  const runRoot = asRecord(root.run);
  const dataRun = asRecord(data.run);
  const jobRun = asRecord(job.run);
  const nestedRun = asRecord(nested.run);

  const selected_override_keys = [];

  const eventType =
    firstNonEmptyString([
      root.type,
      root.eventType,
      root.event,
      nested.type,
      nested.eventType,
      data.type,
      job.event,
      job.type,
    ]) || 'statusChange';

  const statusPick = pickString(
    root,
    'CURSOR_WEBHOOK_STATUS_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        dataRun.status,
        dataRun.state,
        runRoot.status,
        runRoot.state,
        jobRun.status,
        jobRun.state,
        nestedRun.status,
        nestedRun.state,
        agent.status,
        agent.state,
        job.status,
        job.state,
        data.status,
        data.state,
        nested.status,
        nested.state,
        root.status,
        root.state,
        root.runStatus,
      ]),
      trace: 'heuristic:nested.status|state',
    }),
    selected_override_keys,
  );
  const statusRaw = String(statusPick.value || '').toLowerCase();

  const runIdPick = pickString(
    root,
    'CURSOR_WEBHOOK_RUN_ID_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        dataRun.id,
        dataRun.runId,
        dataRun.run_id,
        jobRun.id,
        nestedRun.id,
        nestedRun.runId,
        nestedRun.run_id,
        runRoot.id,
        runRoot.runId,
        runRoot.run_id,
        agent.runId,
        agent.run_id,
        agent.id,
        job.runId,
        job.run_id,
        job.id,
        data.runId,
        data.run_id,
        data.agentRunId,
        data.cloudRunId,
        nested.runId,
        nested.run_id,
        nested.agentRunId,
        nested.cloudRunId,
        root.runId,
        root.run_id,
        root.agentRunId,
        root.cloudRunId,
        root.externalRunId,
        root.id,
      ]),
      trace: 'heuristic:run.id|runId',
    }),
    selected_override_keys,
  );
  const externalRunId = runIdPick.value;

  const threadPick = pickString(
    root,
    'CURSOR_WEBHOOK_THREAD_KEY_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        context.thread_key,
        context.threadKey,
        data.thread_key,
        data.threadKey,
        job.thread_key,
        job.threadKey,
        nested.thread_key,
        nested.threadKey,
        root.thread_key,
        root.threadKey,
      ]),
      trace: 'heuristic:context.threadKey',
    }),
    selected_override_keys,
  );
  const threadKeyHint = threadPick.value;

  const packetPick = pickString(
    root,
    'CURSOR_WEBHOOK_PACKET_ID_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        context.packet_id,
        context.packetId,
        data.packet_id,
        data.packetId,
        job.packet_id,
        job.packetId,
        nested.packet_id,
        nested.packetId,
        root.packet_id,
        root.packetId,
      ]),
      trace: 'heuristic:packet_id',
    }),
    selected_override_keys,
  );
  const packetIdHint = packetPick.value;

  const acceptedIdPathEnv = String(env.CURSOR_WEBHOOK_ACCEPTED_ID_PATH || '').trim();
  /** @type {string} */
  let acceptedExternalIdHint = '';
  /** @type {string} */
  let acceptedIdSource = '';
  if (acceptedIdPathEnv) {
    const v = getByDotPath(root, acceptedIdPathEnv);
    if (v != null && String(v).trim()) {
      acceptedExternalIdHint = String(v).trim();
      acceptedIdSource = acceptedIdPathEnv;
      selected_override_keys.push('CURSOR_WEBHOOK_ACCEPTED_ID_PATH');
    }
  }
  if (!acceptedExternalIdHint) {
    const v = firstNonEmptyString([
      root.backgroundComposerId,
      root.composerId,
      root.background_composer_id,
      data.backgroundComposerId,
      data.composerId,
      data.background_composer_id,
      nested.backgroundComposerId,
      nested.composerId,
      job.backgroundComposerId,
      job.composerId,
      agent.backgroundComposerId,
      agent.composerId,
    ]);
    if (v) {
      acceptedExternalIdHint = v;
      acceptedIdSource = 'heuristic:accepted_external_id';
    }
  }

  const callbackRequestIdHint = firstNonEmptyString([
    root.request_id,
    nested.request_id,
    data.request_id,
    context.request_id,
    job.request_id,
    root.correlationRequestId,
    data.correlationRequestId,
  ]);

  const pathsTouchedRaw = (() => {
    const lists = [data.paths_touched, nested.paths_touched, job.paths_touched, root.paths_touched];
    for (const L of lists) {
      if (Array.isArray(L)) return L;
    }
    return [];
  })();
  const callbackPathFingerprintHint = pathsTouchedRaw.length
    ? computePathsArrayFingerprint(pathsTouchedRaw)
    : '';

  const runUuidHint = firstNonEmptyString([
    context.cos_run_id,
    context.run_uuid,
    data.cos_run_id,
    data.run_uuid,
    nested.cos_run_id,
    nested.runUuid,
    nested.run_uuid,
    root.cos_run_id,
    root.runUuid,
    root.run_uuid,
  ]);

  const branchPick = pickString(
    root,
    'CURSOR_WEBHOOK_BRANCH_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        dataRun.branch,
        dataRun.gitBranch,
        runRoot.branch,
        data.branch,
        job.branch,
        nested.branch,
        nested.gitBranch,
        root.branch,
        root.gitBranch,
      ]),
      trace: 'heuristic:branch',
    }),
    selected_override_keys,
  );
  const branchRaw = branchPick.value;

  const prPick = pickString(
    root,
    'CURSOR_WEBHOOK_PR_URL_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        dataRun.prUrl,
        dataRun.pullRequestUrl,
        data.prUrl,
        data.pullRequestUrl,
        job.pullRequestUrl,
        job.prUrl,
        nested.prUrl,
        nested.pullRequestUrl,
        root.prUrl,
        root.pullRequestUrl,
      ]),
      trace: 'heuristic:prUrl',
    }),
    selected_override_keys,
  );
  const prUrlRaw = prPick.value;

  const summaryPick = pickString(
    root,
    'CURSOR_WEBHOOK_SUMMARY_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        dataRun.summary,
        runRoot.summary,
        data.summary,
        job.message,
        job.summary,
        nested.summary,
        nested.message,
        root.summary,
        root.message,
        root.title,
      ]),
      trace: 'heuristic:summary|message',
    }),
    selected_override_keys,
  );
  const summaryRaw = summaryPick.value;

  const occurredPick = pickString(
    root,
    'CURSOR_WEBHOOK_OCCURRED_AT_PATH',
    env,
    () => ({
      value: firstNonEmptyString([
        root.occurred_at,
        root.occurredAt,
        root.timestamp,
        nested.occurred_at,
        data.occurred_at,
        job.updatedAt,
      ]),
      trace: 'heuristic:occurred_at|timestamp',
    }),
    selected_override_keys,
  );
  const occurredPickVal = occurredPick.value;

  return {
    root,
    eventType,
    statusPick,
    runIdPick,
    threadPick,
    packetPick,
    runUuidHint,
    branchPick,
    prPick,
    summaryPick,
    occurredPickVal,
    statusRaw,
    externalRunId,
    threadKeyHint,
    packetIdHint,
    acceptedExternalIdHint,
    acceptedIdSource,
    callbackRequestIdHint,
    callbackPathFingerprintHint,
    paths_touched_count: pathsTouchedRaw.length,
    selected_override_keys,
  };
}

/**
 * Safe subset for ops summaries: observed dot-path / env override sources (no raw body).
 * Prefer env override field names when set and non-empty; otherwise heuristic trace labels.
 * @param {unknown} body
 * @param {NodeJS.ProcessEnv} [env]
 */
export function peekCursorWebhookObservedSchemaSnapshot(body, env = process.env) {
  const rootObj = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const sel = computeCursorWebhookFieldSelection(/** @type {Record<string, unknown>} */ (rootObj), env);
  const top = sel.root;
  return {
    top_level_keys: Object.keys(top).slice(0, 40),
    observed_run_id_field: String(sel.runIdPick.source || '').slice(0, 120),
    observed_status_field: String(sel.statusPick.source || '').slice(0, 120),
    observed_thread_field: String(sel.threadPick.source || '').slice(0, 120),
    observed_packet_field: String(sel.packetPick.source || '').slice(0, 120),
    selected_override_keys: sel.selected_override_keys.map((x) => String(x).slice(0, 80)),
    run_id_candidate_present: Boolean(String(sel.externalRunId || '').trim()),
    status_candidate_present: Boolean(String(sel.statusPick.value || '').trim()),
    thread_hint_present: Boolean(String(sel.threadKeyHint || '').trim()),
    packet_hint_present: Boolean(String(sel.packetIdHint || '').trim()),
    run_uuid_hint_present: Boolean(String(sel.runUuidHint || '').trim()),
    accepted_id_candidate_present: Boolean(String(sel.acceptedExternalIdHint || '').trim()),
    callback_request_id_present: Boolean(String(sel.callbackRequestIdHint || '').trim()),
    path_fingerprint_candidate_present: Boolean(String(sel.callbackPathFingerprintHint || '').trim()),
    normalization_would_accept: Boolean(
      sel.externalRunId ||
        sel.threadKeyHint ||
        (sel.runUuidHint && sel.packetIdHint) ||
        sel.acceptedExternalIdHint,
    ),
    run_id_candidate_tail: (() => {
      const v = String(sel.externalRunId || '').trim();
      return v.length > 8 ? v.slice(-8) : v;
    })(),
    status_candidate_raw: String(sel.statusPick.value || '').trim().slice(0, 200),
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {null | { canonical: Record<string, unknown>, evidence: Record<string, unknown> }}
 */
export function normalizeCursorWebhookPayload(body, env = process.env) {
  const sel = computeCursorWebhookFieldSelection(body, env);
  const {
    root,
    eventType,
    statusPick,
    runIdPick,
    threadPick,
    packetPick,
    runUuidHint,
    branchPick,
    prPick,
    summaryPick,
    occurredPickVal,
    statusRaw,
    externalRunId,
    threadKeyHint,
    packetIdHint,
    acceptedExternalIdHint,
    acceptedIdSource,
    callbackRequestIdHint,
    callbackPathFingerprintHint,
    selected_override_keys,
  } = sel;

  const hasMinBasis = Boolean(
    externalRunId ||
      threadKeyHint ||
      (runUuidHint && packetIdHint) ||
      acceptedExternalIdHint,
  );
  if (!hasMinBasis) {
    return null;
  }

  const branchRaw = branchPick.value;
  const prUrlRaw = prPick.value;
  const summaryRaw = summaryPick.value;

  const canon = canonicalizeExternalRunStatus(statusRaw);
  let status_hint = 'external_status_update';
  if (canon.bucket === 'positive_terminal') status_hint = 'external_completed';
  else if (canon.bucket === 'negative_terminal') status_hint = 'external_failed';

  const occurred_at = occurredPickVal || new Date().toISOString();
  const accTrim = String(acceptedExternalIdHint || '').trim();
  const external_id = externalRunId
    ? `cursor:cloud_run:${externalRunId}`
    : accTrim
      ? `cursor:accepted:${accTrim}`
      : `cursor:hint:${runUuidHint || threadKeyHint || 'unknown'}`;

  const canonical = {
    provider: 'cursor',
    event_type: eventType || 'statusChange',
    external_id,
    external_run_id: externalRunId || null,
    accepted_external_id_hint: accTrim || null,
    callback_request_id_hint: String(callbackRequestIdHint || '').trim() || null,
    callback_path_fingerprint_hint: String(callbackPathFingerprintHint || '').trim() || null,
    status_hint,
    thread_key_hint: threadKeyHint || null,
    packet_id_hint: packetIdHint || null,
    run_id_hint: runUuidHint || null,
    occurred_at,
    payload: {
      status: statusRaw || null,
      branch: branchRaw || null,
      pr_url: prUrlRaw || null,
      summary: summaryRaw ? summaryRaw.slice(0, 500) : null,
      raw_keys: Object.keys(root).slice(0, 40),
      canonical_status_bucket: canon.bucket,
      canonical_status_label: canon.canonical_label,
      source_status_field: statusPick.source,
      source_run_id_field: runIdPick.source,
      source_accepted_id_field: acceptedIdSource || null,
    },
  };

  const evidence = {
    selected_override_keys,
    source_status_field_name: statusPick.source,
    source_run_id_field_name: runIdPick.source,
    source_accepted_id_field_name: acceptedIdSource || null,
    canonical_status: canon.bucket,
    canonical_status_label: canon.canonical_label,
  };

  return { canonical, evidence };
}
