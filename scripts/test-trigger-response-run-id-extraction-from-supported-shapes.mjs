/**
 * vNext.13.48 — extractAutomationResponseFields finds run id on documented response shapes (field must exist).
 */
import assert from 'node:assert';
import { extractAutomationResponseFields } from '../src/founder/cursorCloudAdapter.js';

const env = {};

const cases = [
  { body: { run_id: 'r1' }, expectField: 'run_id' },
  { body: { runId: 'r2' }, expectField: 'runId' },
  { body: { id: 'r3' }, expectField: 'id' },
  { body: { data: { run: { id: 'deep' } } }, expectField: 'data.run.id' },
  { body: { result: { agentRunId: 'ag' } }, expectField: 'result.agentRunId' },
  { body: { result: { runId: 'rr' } }, expectField: 'result.runId' },
  { body: { job: { run: { id: 'jr' } } }, expectField: 'job.run.id' },
  { body: { payload: { run: { id: 'pr' } } }, expectField: 'payload.run.id' },
];

for (const { body, expectField } of cases) {
  const x = extractAutomationResponseFields(body, env);
  assert.ok(x.external_run_id, `expected id for ${expectField}`);
  assert.equal(x.selected_run_id_field_name, expectField, JSON.stringify(body));
  assert.equal(x.has_run_id, true);
}

console.log('test-trigger-response-run-id-extraction-from-supported-shapes: ok');
