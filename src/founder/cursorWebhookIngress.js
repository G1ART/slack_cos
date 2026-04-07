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

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown> | null} canonical-shaped object (see canonicalExternalEvent.js)
 */
export function normalizeCursorWebhookPayload(body) {
  const root = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const nested =
    root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)
      ? /** @type {Record<string, unknown>} */ (root.payload)
      : {};
  const pick = (k) => root[k] ?? nested[k];

  const eventType = String(pick('type') || pick('eventType') || pick('event') || 'statusChange').trim();
  const statusRaw = String(pick('status') || pick('state') || pick('runStatus') || '').trim().toLowerCase();

  const externalRunId = String(
    pick('runId') ||
      pick('run_id') ||
      pick('agentRunId') ||
      pick('cloudRunId') ||
      pick('id') ||
      '',
  ).trim();

  const threadKeyHint = String(pick('thread_key') || pick('threadKey') || '').trim();
  const packetIdHint = String(pick('packet_id') || pick('packetId') || '').trim();
  /** UUID of cos_runs row if provided */
  const runUuidHint = String(pick('cos_run_id') || pick('runUuid') || pick('run_uuid') || '').trim();

  const branch = pick('branch') || pick('gitBranch');
  const prUrl = pick('prUrl') || pick('pullRequestUrl');
  const summary = pick('summary') || pick('message') || pick('title');

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

  const occurred_at = new Date().toISOString();
  const external_id = externalRunId ? `cursor:cloud_run:${externalRunId}` : `cursor:hint:${runUuidHint || threadKeyHint || 'unknown'}`;

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
      branch: branch != null ? String(branch) : null,
      pr_url: prUrl != null ? String(prUrl) : null,
      summary: summary != null ? String(summary).slice(0, 500) : null,
      raw_keys: Object.keys(root).slice(0, 40),
    },
  };
}
