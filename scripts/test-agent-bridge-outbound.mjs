#!/usr/bin/env node
/** COS_AGENT_BRIDGE_* — 아웃바운드 JSON POST 스모크 (로컬 HTTP 수신) */
import assert from 'node:assert/strict';
import http from 'http';

const secret = 'test-bridge-secret-xyz';

await new Promise((resolveListen, rejectListen) => {
  /** @type {((v: unknown) => void) | null} */
  let resolveBody = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let bodyTimeout = null;
  const bodyPromise = new Promise((res, rej) => {
    resolveBody = (j) => {
      if (bodyTimeout) clearTimeout(bodyTimeout);
      res(j);
    };
    bodyTimeout = setTimeout(() => rej(new Error('timeout waiting for POST')), 8000);
  });

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        assert.equal(String(req.headers['x-cos-agent-bridge-secret'] || ''), secret);
        const j = JSON.parse(raw || '{}');
        resolveBody?.(j);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch (e) {
        res.writeHead(500);
        res.end(String(/** @type {any} */ (e)?.message || e));
      }
      server.close();
    });
  });
  server.on('error', rejectListen);

  server.listen(0, '127.0.0.1', async () => {
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === 'object' && addr.port != null);
      const port = /** @type {import('net').AddressInfo} */ (addr).port;
      process.env.COS_AGENT_BRIDGE_URL = `http://127.0.0.1:${port}/ingest`;
      process.env.COS_AGENT_BRIDGE_SECRET = secret;
      process.env.COS_BRIDGE_INSTANCE_ID = 'test-instance';

      const { fireAgentBridgeNotify } = await import('../src/features/agentBridgeOutbound.js');
      fireAgentBridgeNotify({
        event: 'tool_dispatch',
        tool: 'cursor',
        version: 1,
        work_id: 'WRK-BRIDGE-TEST',
        run_id: 'RUN-BRIDGE-TEST',
      });

      const payload = await bodyPromise;
      assert.equal(payload.event, 'tool_dispatch');
      assert.equal(payload.tool, 'cursor');
      assert.equal(payload.work_id, 'WRK-BRIDGE-TEST');
      assert.equal(payload.run_id, 'RUN-BRIDGE-TEST');
      assert.equal(payload.cos_instance, 'test-instance');
      assert.ok(typeof payload.emitted_at === 'string' && payload.emitted_at.length > 10);

      delete process.env.COS_AGENT_BRIDGE_URL;
      delete process.env.COS_AGENT_BRIDGE_SECRET;
      delete process.env.COS_BRIDGE_INSTANCE_ID;

      resolveListen(undefined);
    } catch (e) {
      try {
        server.close();
      } catch {
        /* ignore */
      }
      rejectListen(e);
    }
  });
});

console.log('ok: agent_bridge_outbound');
