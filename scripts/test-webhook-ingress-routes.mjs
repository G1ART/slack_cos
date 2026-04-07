import assert from 'node:assert';
import http from 'node:http';
import { startCosHttpServer } from '../src/founder/httpExternalIngress.js';

const env = {
  ...process.env,
  PORT: '0',
  COS_HTTP_DISABLED: '',
  GITHUB_WEBHOOK_SECRET: '',
  CURSOR_WEBHOOK_SECRET: '',
  RAILWAY_WEBHOOK_SECRET: '',
};

const { stop, port } = await startCosHttpServer({ env, host: '127.0.0.1' });
const origin = `http://127.0.0.1:${port}`;

function postJson(path, body) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

try {
  for (const path of ['/webhooks/github', '/webhooks/cursor', '/webhooks/railway']) {
    const res = await postJson(path, { ping: 1 });
    assert.ok(res.status === 200 || res.status === 202, `${path} status ${res.status}`);
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.accepted, true);
    assert.ok(typeof j.source === 'string');
  }

  const bad = await fetch(`${origin}/webhooks/cursor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(bad.status, 400);

  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/webhooks/github',
        method: 'POST',
        headers: { 'Content-Length': '600000' },
      },
      (res) => {
        try {
          assert.equal(res.statusCode, 413);
          res.resume();
          res.on('end', resolve);
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on('error', reject);
    req.end();
  });
} finally {
  await stop();
}

console.log('test-webhook-ingress-routes: ok');
