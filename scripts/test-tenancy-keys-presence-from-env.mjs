/**
 * tenancyKeysPresenceFromEnv — 부트용 불리언만, 값 미노출.
 */
import assert from 'node:assert/strict';
import {
  COS_PARCEL_DEPLOYMENT_KEY_ENV,
  COS_PRODUCT_KEY_ENV,
  COS_PROJECT_SPACE_KEY_ENV,
  COS_WORKSPACE_KEY_ENV,
  tenancyKeysPresenceFromEnv,
} from '../src/founder/parcelDeploymentContext.js';

const keys = [
  COS_PARCEL_DEPLOYMENT_KEY_ENV,
  COS_WORKSPACE_KEY_ENV,
  COS_PRODUCT_KEY_ENV,
  COS_PROJECT_SPACE_KEY_ENV,
];
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

function restore() {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

try {
  for (const k of keys) delete process.env[k];
  assert.deepEqual(tenancyKeysPresenceFromEnv(), {
    parcel_deployment: false,
    workspace: false,
    product: false,
    project_space: false,
  });

  process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV] = 'rail_test';
  process.env[COS_WORKSPACE_KEY_ENV] = 'T01';
  assert.deepEqual(tenancyKeysPresenceFromEnv(), {
    parcel_deployment: true,
    workspace: true,
    product: false,
    project_space: false,
  });
} finally {
  restore();
}

console.log('test-tenancy-keys-presence-from-env: ok');
