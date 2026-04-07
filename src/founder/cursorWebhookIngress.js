/**
 * Cursor Cloud Agent webhook verify + payload normalization (runtime plumbing).
 */

import crypto from 'node:crypto';

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
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown> | null} canonical-shaped object (see canonicalExternalEvent.js)
 */
export function normalizeCursorWebhookPayload(body) {
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

  const statusRaw = firstNonEmptyString([
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
  ]).toLowerCase();

  const externalRunId = firstNonEmptyString([
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
  ]);

  const threadKeyHint = firstNonEmptyString([
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
  ]);

  const packetIdHint = firstNonEmptyString([
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
  ]);

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

  const branchRaw = firstNonEmptyString([
    dataRun.branch,
    dataRun.gitBranch,
    runRoot.branch,
    data.branch,
    job.branch,
    nested.branch,
    nested.gitBranch,
    root.branch,
    root.gitBranch,
  ]);

  const prUrlRaw = firstNonEmptyString([
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
  ]);

  const summaryRaw = firstNonEmptyString([
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
  ]);

  const occurredPick = firstNonEmptyString([
    root.occurred_at,
    root.occurredAt,
    root.timestamp,
    nested.occurred_at,
    data.occurred_at,
    job.updatedAt,
  ]);

  if (!externalRunId && !threadKeyHint && !(runUuidHint && packetIdHint)) {
    return null;
  }

  let status_hint = 'external_status_update';
  if (statusRaw === 'completed' || statusRaw === 'success' || statusRaw === 'succeeded') {
    status_hint = 'external_completed';
  } else if (
    statusRaw === 'failed' ||
    statusRaw === 'error' ||
    statusRaw === 'canceled' ||
    statusRaw === 'cancelled'
  ) {
    status_hint = 'external_failed';
  }

  const occurred_at = occurredPick || new Date().toISOString();
  const external_id = externalRunId
    ? `cursor:cloud_run:${externalRunId}`
    : `cursor:hint:${runUuidHint || threadKeyHint || 'unknown'}`;

  return {
    provider: 'cursor',
    event_type: eventType || 'statusChange',
    external_id,
    external_run_id: externalRunId || null,
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
    },
  };
}
