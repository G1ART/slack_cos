import assert from 'node:assert';
import { getCursorCloudRuntimeTruth } from '../src/founder/cosRuntimeTruth.js';

const clean = {
  CURSOR_CLOUD_AGENT_ENABLED: '',
  CURSOR_AUTOMATION_ENDPOINT: '',
  CURSOR_AUTOMATION_AUTH_HEADER: '',
  CURSOR_WEBHOOK_SECRET: '',
  CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH: '',
};
const t0 = getCursorCloudRuntimeTruth(clean);
assert.equal(t0.cursor_cloud_lane_enabled, false);
assert.equal(t0.cursor_cloud_ready, false);
assert.equal(t0.cursor_callback_signature_mode, 'none');
assert.deepEqual(t0.cursor_cloud_response_paths, []);

const t1 = getCursorCloudRuntimeTruth({
  ...clean,
  CURSOR_CLOUD_AGENT_ENABLED: '1',
  CURSOR_AUTOMATION_ENDPOINT: 'https://hooks.example.com/cursor',
  CURSOR_AUTOMATION_AUTH_HEADER: 'Bearer x',
  CURSOR_WEBHOOK_SECRET: 'whsec_test',
  CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH: 'data.run.id',
  CURSOR_AUTOMATION_RESPONSE_URL_PATH: 'data.run.url',
  CURSOR_WEBHOOK_RUN_ID_PATH: 'agent.id',
});
assert.equal(t1.cursor_cloud_lane_enabled, true);
assert.equal(t1.cursor_cloud_ready, true);
assert.equal(t1.cursor_callback_signature_mode, 'secret-configured');
assert.ok(t1.cursor_cloud_response_paths.includes('CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH'));
assert.ok(t1.cursor_cloud_response_paths.includes('CURSOR_AUTOMATION_RESPONSE_URL_PATH'));
assert.equal(t1.cursor_automation_response_override_count, 2);
assert.ok(t1.cursor_webhook_override_keys.includes('CURSOR_WEBHOOK_RUN_ID_PATH'));
assert.equal(t1.cursor_webhook_override_count, 1);

console.log('test-cursor-cloud-runtime-truth: ok');
