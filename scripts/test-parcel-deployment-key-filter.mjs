/**
 * 최소 테넄시 키: payload 병합·deployment 필터 (parcelDeploymentContext).
 */
import assert from 'node:assert';
import {
  COS_PARCEL_DEPLOYMENT_KEY_ENV,
  COS_PRODUCT_KEY_ENV,
  COS_PROJECT_SPACE_KEY_ENV,
  COS_WORKSPACE_KEY_ENV,
  filterRowsByParcelDeploymentKey,
  parcelDeploymentKeyFromEnv,
  withParcelDeploymentPayload,
} from '../src/founder/parcelDeploymentContext.js';

const saved = {
  [COS_PARCEL_DEPLOYMENT_KEY_ENV]: process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV],
  [COS_WORKSPACE_KEY_ENV]: process.env[COS_WORKSPACE_KEY_ENV],
  [COS_PRODUCT_KEY_ENV]: process.env[COS_PRODUCT_KEY_ENV],
  [COS_PROJECT_SPACE_KEY_ENV]: process.env[COS_PROJECT_SPACE_KEY_ENV],
};

function restoreEnv() {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

try {
  delete process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV];
  delete process.env[COS_WORKSPACE_KEY_ENV];
  delete process.env[COS_PRODUCT_KEY_ENV];
  delete process.env[COS_PROJECT_SPACE_KEY_ENV];

  assert.equal(parcelDeploymentKeyFromEnv(), '');
  const noTag = withParcelDeploymentPayload({ foo: 1 });
  assert.equal(noTag.foo, 1);
  assert.equal(noTag.parcel_deployment_key, undefined);
  assert.equal(noTag.workspace_key, undefined);

  process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV] = 'prod_a';
  process.env[COS_WORKSPACE_KEY_ENV] = 'ws1';
  process.env[COS_PRODUCT_KEY_ENV] = 'g1cos';
  process.env[COS_PROJECT_SPACE_KEY_ENV] = 'space_x';

  const tagged = withParcelDeploymentPayload({ foo: 2 });
  assert.equal(tagged.parcel_deployment_key, 'prod_a');
  assert.equal(tagged.workspace_key, 'ws1');
  assert.equal(tagged.product_key, 'g1cos');
  assert.equal(tagged.project_space_key, 'space_x');

  const keep = withParcelDeploymentPayload({ parcel_deployment_key: 'other', workspace_key: 'keep_ws', x: 1 });
  assert.equal(keep.parcel_deployment_key, 'other');
  assert.equal(keep.workspace_key, 'keep_ws');
  assert.equal(keep.product_key, 'g1cos');

  process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV] = 'a/../b';
  assert.equal(parcelDeploymentKeyFromEnv(), 'a_b');

  const rows = [
    { payload: { parcel_deployment_key: 'a' } },
    { parcel_deployment_key: 'b', payload: {} },
    { payload: {} },
  ];
  assert.equal(filterRowsByParcelDeploymentKey(rows, 'a', false).length, 1);
  assert.equal(filterRowsByParcelDeploymentKey(rows, 'a', true).length, 2);
} finally {
  restoreEnv();
}

console.log('test-parcel-deployment-key-filter: ok');
