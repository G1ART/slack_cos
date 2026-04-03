#!/usr/bin/env node
/** COS_AGENT_BRIDGE_* — 아웃바운드 JSON POST 스모크 (fetch 스텁; listen 불필요) */
import assert from 'node:assert/strict';

const secret = 'test-bridge-secret-xyz';
const savedFetch = globalThis.fetch;

/** @type {{ url: string, init: RequestInit } | null} */
let captured = null;
/** @type {((v?: unknown) => void) | null} */
let releaseCapture = null;
const captureDone = new Promise((res) => {
  releaseCapture = () => res(undefined);
});

globalThis.fetch = async (url, init) => {
  captured = { url: String(url), init: init || {} };
  releaseCapture?.();
  return new Response('ok', { status: 200 });
};

process.env.COS_AGENT_BRIDGE_URL = 'https://bridge.test/__agent_bridge__/ingest';
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

await Promise.race([
  captureDone,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting for agent bridge fetch')), 5000)),
]);

assert.ok(captured, 'fetch should have been invoked');
assert.equal(captured.url, process.env.COS_AGENT_BRIDGE_URL);

const headers = /** @type {Record<string, string>} */ (captured.init.headers || {});
assert.equal(String(headers['X-COS-Agent-Bridge-Secret'] || ''), secret);

const payload = JSON.parse(String(captured.init.body || '{}'));
assert.equal(payload.event, 'tool_dispatch');
assert.equal(payload.tool, 'cursor');
assert.equal(payload.work_id, 'WRK-BRIDGE-TEST');
assert.equal(payload.run_id, 'RUN-BRIDGE-TEST');
assert.equal(payload.cos_instance, 'test-instance');
assert.ok(typeof payload.emitted_at === 'string' && payload.emitted_at.length > 10);

delete process.env.COS_AGENT_BRIDGE_URL;
delete process.env.COS_AGENT_BRIDGE_SECRET;
delete process.env.COS_BRIDGE_INSTANCE_ID;
globalThis.fetch = savedFetch;

console.log('ok: agent_bridge_outbound');
