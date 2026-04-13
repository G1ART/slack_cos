/**
 * 멀티 배포: payload 태그·클라이언트 필터 (parcelDeploymentContext).
 */
import assert from 'node:assert';
import {
  filterRowsByParcelDeploymentKey,
  parcelDeploymentKeyFromEnv,
  withParcelDeploymentPayload,
} from '../src/founder/parcelDeploymentContext.js';

const saved = process.env.COS_PARCEL_DEPLOYMENT_KEY;
try {
  delete process.env.COS_PARCEL_DEPLOYMENT_KEY;
  assert.equal(parcelDeploymentKeyFromEnv(), '');
  const noTag = withParcelDeploymentPayload({ foo: 1 });
  assert.equal(noTag.foo, 1);
  assert.equal(noTag.parcel_deployment_key, undefined);

  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'prod_a';
  assert.equal(parcelDeploymentKeyFromEnv(), 'prod_a');
  const tagged = withParcelDeploymentPayload({ foo: 2 });
  assert.equal(tagged.parcel_deployment_key, 'prod_a');
  const keep = withParcelDeploymentPayload({ parcel_deployment_key: 'other', x: 1 });
  assert.equal(keep.parcel_deployment_key, 'other');

  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'a/../b';
  assert.equal(parcelDeploymentKeyFromEnv(), 'a_b');

  const rows = [
    { payload: { parcel_deployment_key: 'a' } },
    { parcel_deployment_key: 'b', payload: {} },
    { payload: {} },
  ];
  assert.equal(filterRowsByParcelDeploymentKey(rows, 'a', false).length, 1);
  assert.equal(filterRowsByParcelDeploymentKey(rows, 'a', true).length, 2);
} finally {
  if (saved === undefined) delete process.env.COS_PARCEL_DEPLOYMENT_KEY;
  else process.env.COS_PARCEL_DEPLOYMENT_KEY = saved;
}

console.log('test-parcel-deployment-key-filter: ok');
