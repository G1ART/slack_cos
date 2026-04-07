/**
 * HTTP ingress for provider webhooks (Slack remains Socket Mode).
 */

import http from 'node:http';
import { handleGithubWebhookIngress } from './externalEventGateway.js';

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   port?: number,
 * }} [opts]
 * @returns {Promise<() => Promise<void>>} stop
 */
export async function startCosHttpServer(opts = {}) {
  const env = opts.env || process.env;
  if (String(env.COS_HTTP_DISABLED || '').trim() === '1') {
    return async () => {};
  }

  const secret = String(env.GITHUB_WEBHOOK_SECRET || '').trim();
  const enable = String(env.COS_HTTP_ENABLE || '').trim() === '1' || !!secret;
  if (!enable) {
    return async () => {};
  }

  const port = Number(opts.port ?? env.COS_HTTP_PORT ?? env.PORT ?? 8080);

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = String(req.url || '').split('?')[0];

      if (req.method === 'GET' && urlPath === '/cos/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
        return;
      }

      if (req.method === 'POST' && urlPath === '/cos/webhooks/github') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const rawBody = Buffer.concat(chunks);
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
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      console.info(
        JSON.stringify({
          event: 'cos_http_listen',
          port,
          routes: ['/cos/health', '/cos/webhooks/github'],
        }),
      );
      resolve(null);
    });
  });

  return () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
}
