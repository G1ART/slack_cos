import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, __cursorExecFileForTests } from '../src/founder/toolsBridge.js';
import { __cursorAutomationFetchForTests } from '../src/founder/cursorCloudAdapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cloud-first');

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
delete process.env.CURSOR_CLI_BIN;
delete process.env.CURSOR_PROJECT_DIR;

const spec = {
  tool: 'cursor',
  action: 'create_spec',
  payload: { title: 't', body: 'b' },
};

process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/automation';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer test';
__cursorAutomationFetchForTests.fn = async () =>
  new Response(JSON.stringify({ run_id: 'cloud-run-1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const cloud = await invokeExternalTool(spec, { threadKey: '' });
assert.equal(cloud.execution_lane, 'cloud_agent');
assert.equal(cloud.outcome_code, 'cloud_agent_dispatch_accepted');
assert.equal(cloud.status, 'running');
assert.equal(cloud.external_run_id, 'cloud-run-1');
__cursorAutomationFetchForTests.fn = null;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_PROJECT_DIR = __dirname;
process.env.CURSOR_CLI_BIN = 'true';
__cursorExecFileForTests.fn = async () => ({ stdout: 'ok', stderr: '' });
const cli = await invokeExternalTool(spec, { threadKey: '' });
assert.equal(cli.execution_lane, 'local_cli');
assert.equal(cli.outcome_code, 'live_completed');
__cursorExecFileForTests.fn = null;
delete process.env.CURSOR_CLI_BIN;
delete process.env.CURSOR_PROJECT_DIR;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;

const art = await invokeExternalTool(spec, { threadKey: '' });
assert.equal(art.execution_lane, 'artifact');
assert.equal(art.outcome_code, 'artifact_prepared');

console.log('test-cloud-first-local-fallback-selection: ok');
