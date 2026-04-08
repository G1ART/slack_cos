/**
 * vNext.13.49 — backgroundComposerId fills accepted_external_id only; canonical external_run_id stays separate.
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
assert.equal(onlyComposer.accepted_external_id, 'cmp_abc');
assert.equal(onlyComposer.selected_accepted_id_field_name, 'backgroundComposerId');

const both = extractAutomationResponseFields(
  { run_id: 'canonical_run', backgroundComposerId: 'cmp_abc' },
  {},
);
assert.equal(both.external_run_id, 'canonical_run');
assert.equal(both.has_run_id, true);
assert.equal(both.accepted_external_id, 'cmp_abc');
assert.equal(both.selected_run_id_field_name, 'run_id');
assert.equal(both.selected_accepted_id_field_name, 'backgroundComposerId');

console.log('test-accepted-id-is-not-labeled-canonical-run-id: ok');
