/**
 * vNext.13.74 — backgroundComposerId is provider hint only; canonical run_id stays separate;
 * accepted_external_id is set only via local_trigger_request_id or env accepted path.
 */
import assert from 'node:assert';
import { extractAutomationResponseFields } from '../src/founder/cursorCloudAdapter.js';

const onlyComposer = extractAutomationResponseFields(
  { success: true, backgroundComposerId: 'cmp_abc' },
  {},
);
assert.equal(onlyComposer.external_run_id, null);
assert.equal(onlyComposer.selected_run_id_field_name, null);
assert.equal(onlyComposer.has_run_id, false);
assert.equal(onlyComposer.has_accepted_external_id, false);
assert.equal(onlyComposer.accepted_external_id, null);
assert.equal(onlyComposer.provider_run_hint, 'cmp_abc');

const both = extractAutomationResponseFields(
  { run_id: 'canonical_run', backgroundComposerId: 'cmp_abc' },
  {},
);
assert.equal(both.external_run_id, 'canonical_run');
assert.equal(both.has_run_id, true);
assert.equal(both.has_accepted_external_id, false);
assert.equal(both.accepted_external_id, null);
assert.equal(both.selected_run_id_field_name, 'run_id');
assert.equal(both.provider_run_hint, 'cmp_abc');

const invoiced = extractAutomationResponseFields(
  { run_id: 'canonical_run', backgroundComposerId: 'cmp_abc' },
  {},
  { localTriggerRequestId: 'req_inv_1' },
);
assert.equal(invoiced.external_run_id, 'canonical_run');
assert.equal(invoiced.accepted_external_id, 'req_inv_1');
assert.equal(invoiced.selected_accepted_id_field_name, 'local_trigger_request_id');
assert.equal(invoiced.provider_run_hint, 'cmp_abc');

console.log('test-accepted-id-is-not-labeled-canonical-run-id: ok');
