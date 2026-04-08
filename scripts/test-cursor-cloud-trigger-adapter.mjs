import assert from 'node:assert';
import {
  triggerCursorAutomation,
  __cursorAutomationFetchForTests,
  headersFromAutomationAuth,
  isCursorCloudAgentLaneReady,
} from '../src/founder/cursorCloudAdapter.js';

assert.equal(headersFromAutomationAuth('Bearer x').Authorization, 'Bearer x');
assert.equal(headersFromAutomationAuth('X-Api-Key: abc')['X-Api-Key'], 'abc');

process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/cursor';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer sec';
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
assert.equal(isCursorCloudAgentLaneReady(process.env), true);

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
assert.equal(isCursorCloudAgentLaneReady(process.env), false);

process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
__cursorAutomationFetchForTests.fn = async (url, init) => {
  assert.equal(url, 'https://example.com/hooks/cursor');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  const parsed = JSON.parse(String(init.body));
  assert.equal(parsed.action, 'create_spec');
  assert.equal(parsed.request_id, 'inv-1');
  return new Response(JSON.stringify({ run_id: 'run-abc', url: 'https://cursor.internal/x' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const ok = await triggerCursorAutomation({
  action: 'create_spec',
  payload: { title: 't' },
  env: process.env,
  invocation_id: 'inv-1',
});
assert.equal(ok.ok, true);
assert.equal(ok.trigger_status, 'accepted');
assert.equal(ok.external_run_id, 'run-abc');

__cursorAutomationFetchForTests.fn = async () => new Response('nope', { status: 502 });
const bad = await triggerCursorAutomation({
  action: 'emit_patch',
  payload: {},
  env: process.env,
  invocation_id: 'inv-2',
});
assert.equal(bad.ok, false);
assert.equal(bad.error_code, 'cursor_automation_http_502');

__cursorAutomationFetchForTests.fn = async () => {
  throw new Error('net down');
};
const err = await triggerCursorAutomation({ action: 'create_spec', payload: {}, env: process.env });
assert.equal(err.ok, false);
assert.equal(err.trigger_status, 'fetch_error');

process.env.CURSOR_CLOUD_TIMEOUT_MS = '1';
__cursorAutomationFetchForTests.fn = (_u, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
const to = await triggerCursorAutomation({ action: 'create_spec', payload: {}, env: process.env });
assert.equal(to.trigger_status, 'timeout');
assert.equal(to.error_code, 'cursor_automation_timeout');
delete process.env.CURSOR_CLOUD_TIMEOUT_MS;

__cursorAutomationFetchForTests.fn = async () =>
  new Response('not json {{{', { status: 200, headers: { 'Content-Type': 'text/plain' } });
const mal = await triggerCursorAutomation({ action: 'create_spec', payload: {}, env: process.env });
assert.equal(mal.ok, true);
assert.equal(mal.external_run_id, null);
assert.equal(mal.has_accepted_external_id, false);

__cursorAutomationFetchForTests.fn = null;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;

console.log('test-cursor-cloud-trigger-adapter: ok');
