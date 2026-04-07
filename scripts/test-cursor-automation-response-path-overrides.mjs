import assert from 'node:assert';
import { extractAutomationResponseFields, getByDotPath } from '../src/founder/cursorCloudAdapter.js';

assert.equal(getByDotPath({ a: { b: { c: 3 } } }, 'a.b.c'), 3);
assert.strictEqual(getByDotPath({}, 'a.b'), undefined);

const nested = {
  id: 'wrong-top',
  data: { run: { id: 'deep-id', url: 'https://run.example/internal' } },
};
const withPath = extractAutomationResponseFields(nested, {
  CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH: 'data.run.id',
  CURSOR_AUTOMATION_RESPONSE_URL_PATH: 'data.run.url',
});
assert.equal(withPath.external_run_id, 'deep-id');
assert.equal(withPath.external_url, 'https://run.example/internal');

const noPath = extractAutomationResponseFields(nested, {});
assert.equal(noPath.external_run_id, 'wrong-top');

const statusEnv = {
  CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH: 'result.agentRunId',
  CURSOR_AUTOMATION_RESPONSE_STATUS_PATH: 'result.phase',
  CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH: 'result.ref',
};
const st = extractAutomationResponseFields(
  { result: { agentRunId: 'ag-1', phase: 'running', ref: 'feature/smoke' } },
  statusEnv,
);
assert.equal(st.external_run_id, 'ag-1');
assert.equal(st.automation_status_raw, 'running');
assert.equal(st.automation_branch_raw, 'feature/smoke');

console.log('test-cursor-automation-response-path-overrides: ok');
