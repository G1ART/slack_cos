/**
 * 멀티 배포: COS_OPS_SMOKE_SESSION_ID_PREFIX 가 자동 smoke 세션 ID에만 붙는지.
 */
import assert from 'node:assert';
import {
  __resetOpsSmokeSessionCacheForTests,
  resolveSmokeSessionId,
  smokeSessionIdAutoPrefixFromEnv,
} from '../src/founder/smokeOps.js';

__resetOpsSmokeSessionCacheForTests();
process.env.COS_OPS_SMOKE_ENABLED = '1';
delete process.env.COS_OPS_SMOKE_SESSION_ID;
process.env.COS_OPS_SMOKE_SESSION_ID_PREFIX = 'prod-A+ x';
assert.equal(smokeSessionIdAutoPrefixFromEnv(process.env), 'prod-A_x_');
const id1 = resolveSmokeSessionId(process.env);
assert.ok(id1.startsWith('prod-A_x_smoke_'), id1);

__resetOpsSmokeSessionCacheForTests();
delete process.env.COS_OPS_SMOKE_SESSION_ID_PREFIX;
const id2 = resolveSmokeSessionId(process.env);
assert.ok(/^smoke_\d+_[a-f0-9]+$/.test(id2), id2);

__resetOpsSmokeSessionCacheForTests();
process.env.COS_OPS_SMOKE_SESSION_ID = 'fixed_sess_1';
process.env.COS_OPS_SMOKE_SESSION_ID_PREFIX = 'ignored_';
assert.equal(resolveSmokeSessionId(process.env), 'fixed_sess_1');

__resetOpsSmokeSessionCacheForTests();
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.COS_OPS_SMOKE_SESSION_ID_PREFIX;
delete process.env.COS_OPS_SMOKE_ENABLED;
__resetOpsSmokeSessionCacheForTests();

console.log('test-smoke-session-id-prefix: ok');
