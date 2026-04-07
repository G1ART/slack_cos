import assert from 'node:assert';
import { startCosHttpServer } from '../src/founder/httpExternalIngress.js';

const env = {
  ...process.env,
  PORT: '0',
  COS_HTTP_DISABLED: '',
};

const { stop, port } = await startCosHttpServer({ env, host: '127.0.0.1' });
const origin = `http://127.0.0.1:${port}`;
assert.ok(port > 0, 'ephemeral port');

try {
  const hz = await fetch(`${origin}/healthz`);
  assert.equal(hz.status, 200);
  const hj = await hz.json();
  assert.equal(hj.ok, true);
  assert.equal(hj.service, 'g1-cos');
  assert.equal(hj.mode, 'socket');
  assert.ok(typeof hj.runtime === 'string' && hj.runtime.length);
  assert.ok(typeof hj.version === 'string' && hj.version.length);

  const rz = await fetch(`${origin}/readyz`);
  assert.equal(rz.status, 200);
  const rj = await rz.json();
  assert.equal(rj.ok, true);
  assert.ok(['ready', 'degraded'].includes(rj.readiness));
  assert.ok(rj.checks && typeof rj.checks === 'object');
  assert.equal(rj.checks.public_ingress, 'ok');
  assert.equal(rj.service, 'g1-cos');
  assert.equal(rj.mode, 'socket');
} finally {
  await stop();
}

console.log('test-http-health-endpoints: ok');
