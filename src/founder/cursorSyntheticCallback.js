/**
 * vNext.13.69 — Synthetic Cursor completion webhook body (adapter orchestration).
 * Paths align with emit_patch fingerprint logic (cursorCallbackGate).
 */

import crypto from 'node:crypto';
import { listNormalizedEmitPatchPathsForAnchor } from './cursorCallbackGate.js';

/**
 * @param {{
 *   requestId: string,
 *   acceptedExternalId?: string | null,
 *   externalRunId?: string | null,
 *   threadKey: string,
 *   packetId?: string | null,
 *   payload: Record<string, unknown>,
 *   summary?: string | null,
 * }} p
 * @returns {Record<string, unknown>}
 */
export function buildSyntheticCursorCompletionCallback(p) {
  const requestId = String(p.requestId || '').trim();
  const paths = listNormalizedEmitPatchPathsForAnchor(p.payload || {}).slice(0, 48);
  const acc = p.acceptedExternalId != null ? String(p.acceptedExternalId).trim() : '';
  const runId = p.externalRunId != null ? String(p.externalRunId).trim() : '';
  const threadKey = String(p.threadKey || '').trim();
  const packetId = p.packetId != null ? String(p.packetId).trim() : '';
  /** @type {Record<string, unknown>} */
  const body = {
    type: 'statusChange',
    status: 'completed',
    request_id: requestId,
    paths_touched: paths.length ? paths : [],
    summary:
      p.summary != null && String(p.summary).trim()
        ? String(p.summary).trim().slice(0, 240)
        : 'cos synthetic orchestrator completion',
    occurred_at: new Date().toISOString(),
  };
  if (acc) body.backgroundComposerId = acc;
  if (runId) body.runId = runId;
  if (threadKey || packetId) {
    body.context = {
      ...(threadKey ? { thread_key: threadKey } : {}),
      ...(packetId ? { packet_id: packetId } : {}),
    };
  }
  return body;
}

/**
 * @param {string} secret
 * @param {Buffer} rawBody
 * @returns {string} Value for x-cursor-signature-256
 */
export function signCursorWebhookRawBody(secret, rawBody) {
  const s = String(secret || '').trim();
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const hmac = crypto.createHmac('sha256', s).update(buf).digest('hex');
  return `sha256=${hmac}`;
}
