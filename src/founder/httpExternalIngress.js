/**
 * Public HTTP ingress (health + webhook skeleton). Slack remains Socket Mode.
 * vNext.13.33 — Railway PORT listen, /healthz, /readyz, /webhooks/*
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { handleGithubWebhookIngress, handleCursorWebhookIngress } from './externalEventGateway.js';
import { getCursorCloudRuntimeTruth } from './cosRuntimeTruth.js';

const MAX_WEBHOOK_BYTES = 512 * 1024;

/**
 * @param {import('node:http').IncomingMessage} req
 */
function headerKeysPresent(req) {
  const out = {};
  for (const k of Object.keys(req.headers)) {
    out[String(k).toLowerCase()] = true;
  }
  return out;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} maxBytes
 */
function readBodyWithLimit(req, maxBytes) {
  const cl = req.headers['content-length'];
  if (cl != null) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > maxBytes) {
      return Promise.reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
    }
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function deployVersion(env) {
  const e = env || process.env;
  return (
    String(e.RAILWAY_GIT_COMMIT_SHA || e.RAILWAY_COMMIT_SHA || e.GIT_COMMIT || '').trim() || 'dev'
  );
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function detectRuntime(env) {
  const e = env || process.env;
  if (String(e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID || '').trim()) return 'railway';
  return 'local';
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function buildHealthz(env) {
  const e = env || process.env;
  return {
    ok: true,
    service: 'g1-cos',
    mode: 'socket',
    runtime: detectRuntime(e),
    version: deployVersion(e),
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function buildReadyz(env) {
  const e = env || process.env;
  const hasSb = !!(String(e.SUPABASE_URL || '').trim() && String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim());
  const hasOpenAI = !!String(e.OPENAI_API_KEY || '').trim();
  const hasSlackSocket = !!(
    String(e.SLACK_APP_TOKEN || '').trim() && String(e.SLACK_BOT_TOKEN || '').trim()
  );
  const cc = getCursorCloudRuntimeTruth(e);
  const checks = {
    slack_socket: hasSlackSocket ? 'configured' : 'absent',
    supabase: hasSb ? 'configured' : 'absent',
    openai: hasOpenAI ? 'configured' : 'absent',
    public_ingress: 'ok',
    cursor_cloud_lane: cc.cursor_cloud_lane_enabled ? 'on' : 'off',
    cursor_cloud_automation: cc.cursor_cloud_ready ? 'ready' : 'not_ready',
    cursor_callback_signature: cc.cursor_callback_signature_mode,
    cursor_automation_response_override_count: cc.cursor_cloud_response_paths.length,
  };
  const degraded = !hasOpenAI || !hasSlackSocket;
  return {
    ok: true,
    readiness: degraded ? 'degraded' : 'ready',
    checks,
    service: 'g1-cos',
    mode: 'socket',
    runtime: detectRuntime(e),
    version: deployVersion(e),
  };
}

/**
 * @param {'github'|'cursor'|'railway'} source
 * @param {Record<string, boolean>} headersPresent
 * @param {number} payloadSize
 * @param {string} requestId
 */
function logWebhookAudit(source, headersPresent, payloadSize, requestId) {
  console.info(
    JSON.stringify({
      event: 'cos_webhook_ingress',
      source,
      headers_present: headersPresent,
      payload_size: payloadSize,
      request_id: requestId,
    }),
  );
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   port?: number,
 *   host?: string,
 * }} [opts]
 * @returns {Promise<{ stop: () => Promise<void>, port: number }>}
 */
export async function startCosHttpServer(opts = {}) {
  const env = opts.env || process.env;
  if (String(env.COS_HTTP_DISABLED || '').trim() === '1') {
    return { stop: async () => {}, port: -1 };
  }

  const port = Number(
    opts.port ?? env.PORT ?? env.COS_HTTP_PORT ?? 3000,
  );
  const host = String(opts.host ?? '0.0.0.0');

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = String(req.url || '').split('?')[0];

      if (req.method === 'GET' && urlPath === '/healthz') {
        sendJson(res, 200, buildHealthz(env));
        return;
      }

      if (req.method === 'GET' && urlPath === '/readyz') {
        sendJson(res, 200, buildReadyz(env));
        return;
      }

      if (req.method === 'GET' && urlPath === '/cos/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
        return;
      }

      if (req.method === 'POST' && urlPath === '/webhooks/github') {
        const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
        const headersPresent = headerKeysPresent(req);
        let rawBody;
        try {
          rawBody = await readBodyWithLimit(req, MAX_WEBHOOK_BYTES);
        } catch (e) {
          if (e && e.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { ok: false, error: 'payload too large', source: 'github' });
            return;
          }
          throw e;
        }
        logWebhookAudit('github', headersPresent, rawBody.length, requestId);

        const secret = String(env.GITHUB_WEBHOOK_SECRET || '').trim();
        if (secret) {
          const lower = {};
          for (const [k, v] of Object.entries(req.headers)) {
            lower[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
          }
          const out = await handleGithubWebhookIngress({ rawBody, headers: lower, env });
          sendJson(res, out.httpStatus, {
            ok: out.ok,
            accepted: out.httpStatus >= 200 && out.httpStatus < 300,
            source: 'github',
            message: out.body,
            ignored: out.ignored,
            duplicate: out.duplicate,
            matched: out.matched,
            request_id: requestId,
          });
          return;
        }

        try {
          if (rawBody.length) JSON.parse(rawBody.toString('utf8'));
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid json', source: 'github', request_id: requestId });
          return;
        }
        sendJson(res, 202, { ok: true, accepted: true, source: 'github', request_id: requestId });
        return;
      }

      if (req.method === 'POST' && urlPath === '/webhooks/cursor') {
        const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
        const headersPresent = headerKeysPresent(req);
        let rawBody;
        try {
          rawBody = await readBodyWithLimit(req, MAX_WEBHOOK_BYTES);
        } catch (e) {
          if (e && e.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { ok: false, error: 'payload too large', source: 'cursor', request_id: requestId });
            return;
          }
          throw e;
        }
        logWebhookAudit('cursor', headersPresent, rawBody.length, requestId);
        const cursorSecret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
        if (cursorSecret) {
          /** @type {Record<string, string | undefined>} */
          const lower = {};
          for (const [k, v] of Object.entries(req.headers)) {
            lower[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
          }
          const out = await handleCursorWebhookIngress({ rawBody, headers: lower, env });
          sendJson(res, out.httpStatus, {
            ok: out.ok,
            accepted: out.httpStatus >= 200 && out.httpStatus < 300,
            source: 'cursor',
            message: out.body,
            matched: out.matched,
            ignored: out.ignored,
            request_id: requestId,
          });
          return;
        }
        try {
          if (rawBody.length) JSON.parse(rawBody.toString('utf8'));
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid json', source: 'cursor', request_id: requestId });
          return;
        }
        sendJson(res, 202, { ok: true, accepted: true, source: 'cursor', request_id: requestId });
        return;
      }

      if (req.method === 'POST' && urlPath === '/webhooks/railway') {
        const source = 'railway';
        const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
        const headersPresent = headerKeysPresent(req);
        let rawBody;
        try {
          rawBody = await readBodyWithLimit(req, MAX_WEBHOOK_BYTES);
        } catch (e) {
          if (e && e.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { ok: false, error: 'payload too large', source, request_id: requestId });
            return;
          }
          throw e;
        }
        logWebhookAudit(source, headersPresent, rawBody.length, requestId);
        try {
          if (rawBody.length) JSON.parse(rawBody.toString('utf8'));
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid json', source, request_id: requestId });
          return;
        }
        sendJson(res, 202, { ok: true, accepted: true, source, request_id: requestId });
        return;
      }

      if (req.method === 'POST' && urlPath === '/cos/webhooks/github') {
        let rawBody;
        try {
          rawBody = await readBodyWithLimit(req, MAX_WEBHOOK_BYTES);
        } catch (e) {
          if (e && e.code === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { ok: false, error: 'payload too large', source: 'github' });
            return;
          }
          throw e;
        }
        /** @type {Record<string, string | undefined>} */
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
          headers[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
        }
        const out = await handleGithubWebhookIngress({ rawBody, headers, env });
        res.writeHead(out.httpStatus, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(out.body);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    } catch (e) {
      console.error('[cos_http]', e);
      sendJson(res, 500, { ok: false, error: 'internal_error' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const addr = server.address();
      const listenPort = addr && typeof addr === 'object' ? addr.port : port;
      console.info(
        JSON.stringify({
          event: 'cos_public_ingress_listen',
          public_ingress_port: listenPort,
          public_base_url: String(env.PUBLIC_BASE_URL || '').trim() || null,
          socket_mode_enabled: true,
          host,
          routes: [
            '/healthz',
            '/readyz',
            '/webhooks/github',
            '/webhooks/cursor',
            '/webhooks/railway',
            '/cos/health',
            '/cos/webhooks/github',
          ],
        }),
      );
      resolve(null);
    });
  });

  const addr = server.address();
  const actualPort = addr && typeof addr === 'object' ? addr.port : port;

  const stop = () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { stop, port: actualPort };
}
