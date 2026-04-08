/**
 * vNext.13.49 — COS_OPS_SMOKE_SESSION_ID is the stable audit session (no smoke_turn_*); invoke path can resolve same id.
 */
import assert from 'node:assert';
import {
  __resetOpsSmokeSessionCacheForTests,
  resolveOpsSmokeSessionIdForToolAudit,
  resolveSmokeSessionId,
} from '../src/founder/smokeOps.js';

process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'smoke_2026_configured_parent';

__resetOpsSmokeSessionCacheForTests();

assert.equal(resolveSmokeSessionId(process.env), 'smoke_2026_configured_parent');
assert.equal(resolveOpsSmokeSessionIdForToolAudit(process.env), 'smoke_2026_configured_parent');
assert.equal(resolveSmokeSessionId(process.env), 'smoke_2026_configured_parent');

delete process.env.COS_OPS_SMOKE_SESSION_ID;
__resetOpsSmokeSessionCacheForTests();
const a = resolveSmokeSessionId(process.env);
const b = resolveSmokeSessionId(process.env);
assert.equal(a, b);
assert.ok(String(a || '').startsWith('smoke_'), 'fallback is smoke_* not smoke_turn_*');

delete process.env.COS_OPS_SMOKE_ENABLED;
__resetOpsSmokeSessionCacheForTests();

console.log('test-configured-smoke-session-id-persists-across-turn-and-invocation: ok');
