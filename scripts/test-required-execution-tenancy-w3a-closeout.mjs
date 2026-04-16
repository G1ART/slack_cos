/**
 * W3-A closeout: required execution tenancy guard (fail-closed).
 */
import assert from 'node:assert/strict';
import {
  extractRequiredExecutionTenancy,
  validateRequiredExecutionTenancy,
} from '../src/founder/executionTenancyGuard.js';

const full = {
  workspace_key: 'w',
  product_key: 'p',
  project_space_key: 's',
  parcel_deployment_key: 'd',
};
assert.deepEqual(extractRequiredExecutionTenancy(full), {
  workspace_key: 'w',
  product_key: 'p',
  project_space_key: 's',
  parcel_deployment_key: 'd',
});
const ok = validateRequiredExecutionTenancy(full);
assert.equal(ok.ok, true);

const bad = validateRequiredExecutionTenancy({
  workspace_key: 'w',
  product_key: ' ',
  project_space_key: 's',
});
assert.equal(bad.ok, false);
if (!bad.ok) {
  assert.equal(bad.reason, 'missing_required_execution_tenancy');
  assert.ok(bad.missing_keys.includes('product_key'));
  assert.ok(bad.missing_keys.includes('parcel_deployment_key'));
}

console.log('test-required-execution-tenancy-w3a-closeout: ok');
