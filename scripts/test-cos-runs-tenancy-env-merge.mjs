/**
 * cos_runs 매핑: appRunToDbRow 가 env 테넄시를 채우고, row 가 우선한다.
 */
import assert from 'node:assert/strict';
import {
  COS_PARCEL_DEPLOYMENT_KEY_ENV,
  COS_PRODUCT_KEY_ENV,
  COS_PROJECT_SPACE_KEY_ENV,
  COS_WORKSPACE_KEY_ENV,
} from '../src/founder/parcelDeploymentContext.js';
import { appRunToDbRow } from '../src/founder/runStoreSupabase.js';

const saved = {
  [COS_PARCEL_DEPLOYMENT_KEY_ENV]: process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV],
  [COS_WORKSPACE_KEY_ENV]: process.env[COS_WORKSPACE_KEY_ENV],
  [COS_PRODUCT_KEY_ENV]: process.env[COS_PRODUCT_KEY_ENV],
  [COS_PROJECT_SPACE_KEY_ENV]: process.env[COS_PROJECT_SPACE_KEY_ENV],
};

function restore() {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

try {
  process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV] = 'env_dep';
  process.env[COS_WORKSPACE_KEY_ENV] = 'env_ws';
  process.env[COS_PRODUCT_KEY_ENV] = 'env_prod';
  process.env[COS_PROJECT_SPACE_KEY_ENV] = 'env_space';

  const minimal = {
    thread_key: 't',
    dispatch_id: 'd',
    objective: 'o',
    status: 'running',
    harness_snapshot: {},
  };
  const db = appRunToDbRow(minimal);
  assert.equal(db.parcel_deployment_key, 'env_dep');
  assert.equal(db.workspace_key, 'env_ws');
  assert.equal(db.product_key, 'env_prod');
  assert.equal(db.project_space_key, 'env_space');

  const override = appRunToDbRow({
    ...minimal,
    parcel_deployment_key: 'row_dep',
    workspace_key: 'row_ws',
  });
  assert.equal(override.parcel_deployment_key, 'row_dep');
  assert.equal(override.workspace_key, 'row_ws');
  assert.equal(override.product_key, 'env_prod');
} finally {
  restore();
}

console.log('test-cos-runs-tenancy-env-merge: ok');
