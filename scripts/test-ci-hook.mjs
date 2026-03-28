#!/usr/bin/env node
/** COS CI proof hook — handleCosCiProofJson + HTTP GET /cos/health · POST /cos/ci-proof */
import assert from 'node:assert/strict';
import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = path.join(os.tmpdir(), `cos-ci-hook-${process.pid}.json`);
process.env.AGENT_WORK_QUEUE_FILE = tmp;

const { enqueueFromDecisionPick, getAgentWorkQueueItem } = await import(
  '../src/features/agentWorkQueue.js'
);
const { handleCosCiProofJson, createCosCiHookServer } = await import(
  '../src/runtime/ciWebhookServer.js'
);

const secret = 'test-secret-ci';

let r = await handleCosCiProofJson({}, '');
assert.equal(r.status, 503);

r = await handleCosCiProofJson({ secret: 'x' }, secret);
assert.equal(r.status, 401);

const awq = await enqueueFromDecisionPick({
  packet_id: 'PKT-ci',
  option_id: 'c',
  linked_work_ids: ['WRK-CI'],
  slack_source: {},
});
assert.ok(awq.id);

r = await handleCosCiProofJson(
  { secret, work_queue_id: awq.id, proof: 'job=123 green' },
  secret
);
assert.equal(r.status, 200);
let row = await getAgentWorkQueueItem(awq.id, tmp);
assert.ok(row?.proof_refs?.some((p) => String(p).includes('ci_hook:') && String(p).includes('green')), row);

const awqRun = await enqueueFromDecisionPick({
  packet_id: 'PKT-ci2',
  option_id: 'd',
  linked_work_ids: ['WRK-CI2'],
  linked_run_ids: ['RUN-CI-99'],
  slack_source: {},
});
assert.equal(awqRun.linked_run_id, 'RUN-CI-99');

r = await handleCosCiProofJson(
  { secret, run_id: 'RUN-CI-99', proof: 'deploy ok' },
  secret
);
assert.equal(r.status, 200);
row = await getAgentWorkQueueItem(awqRun.id, tmp);
assert.ok(row?.proof_refs?.some((p) => String(p).includes('deploy ok')), row);

r = await handleCosCiProofJson({ secret, run_id: 'nope', proof: 'x' }, secret);
assert.equal(r.status, 404);

await new Promise((resolve, reject) => {
  const srv = createCosCiHookServer(secret);
  const host = '127.0.0.1';
  const onBindDenied = (err) => {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === 'EPERM' || code === 'EACCES') {
      console.warn(`[ci_hook] HTTP 라우트 테스트 생략 (${code} — 샌드박스 등에서 listen 불가)`);
      resolve(undefined);
      return;
    }
    reject(err);
  };
  srv.once('error', onBindDenied);
  srv.listen(0, host, async () => {
    srv.off('error', onBindDenied);
    try {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
      if (!port) throw new Error('no port');

      const health = await new Promise((res, rej) => {
        http
          .get(`http://127.0.0.1:${port}/cos/health`, (resp) => {
            let d = '';
            resp.on('data', (c) => {
              d += c;
            });
            resp.on('end', () => res({ code: resp.statusCode, d }));
          })
          .on('error', rej);
      });
      assert.equal(health.code, 200);
      const hj = JSON.parse(health.d);
      assert.equal(hj.service, 'g1-cos-ci-hook');
      assert.equal(hj.ok, true);

      const postBody = JSON.stringify({ secret, work_queue_id: awq.id, proof: 'http-integration' });
      const postRes = await new Promise((res, rej) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/cos/ci-proof',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': Buffer.byteLength(postBody),
            },
          },
          (resp) => {
            let d = '';
            resp.on('data', (c) => {
              d += c;
            });
            resp.on('end', () => res({ code: resp.statusCode, d }));
          }
        );
        req.on('error', rej);
        req.write(postBody);
        req.end();
      });
      assert.equal(postRes.code, 200);
      const pj = JSON.parse(postRes.d);
      assert.equal(pj.ok, true);
      assert.equal(pj.work_queue_id, awq.id);

      await new Promise((r) => srv.close(r));
      resolve(undefined);
    } catch (e) {
      srv.close(() => reject(e));
    }
  });
});

await fs.unlink(tmp).catch(() => {});

console.log('ok: ci_hook');
