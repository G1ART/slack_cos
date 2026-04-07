import assert from 'node:assert';
import {
  tryAcquireSupervisorLease,
  __resetSupervisorLeaseMemory,
  __resetSupervisorLeaseDegradedStateForTests,
  getSupervisorLeaseRuntimeMode,
  getSupervisorLeaseBootMode,
  getSupervisorLeaseLastErrorKind,
} from '../src/founder/supervisorLease.js';

const prevFetch = globalThis.fetch;
const supaHost = 'hardening-lease-test.supabase.co';

delete process.env.COS_RUN_SUPERVISOR_DISABLED;

__resetSupervisorLeaseMemory();
__resetSupervisorLeaseDegradedStateForTests();

process.env.SUPABASE_URL = `https://${supaHost}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key_minimum_len______';

assert.equal(getSupervisorLeaseBootMode(process.env), 'supabase');

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes(supaHost)) {
    return new Response(JSON.stringify({ message: 'upstream unavailable' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return prevFetch(input);
};

const ok503 = await tryAcquireSupervisorLease('lease-owner-503');
assert.equal(ok503, true, 'non-200 PostgREST should fall back to memory lease');
assert.equal(getSupervisorLeaseRuntimeMode(), 'degraded-memory');
assert.ok(getSupervisorLeaseLastErrorKind(), 'structured lease error kind after fallback');

globalThis.fetch = prevFetch;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetSupervisorLeaseDegradedStateForTests();
__resetSupervisorLeaseMemory();

process.env.SUPABASE_URL = `https://${supaHost}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key_minimum_len______';

globalThis.fetch = async () => {
  const err = new TypeError('fetch failed');
  err.cause = new Error('ECONNREFUSED');
  throw err;
};

const okThrow = await tryAcquireSupervisorLease('lease-owner-throw');
assert.equal(okThrow, true, 'thrown fetch should fall back to memory lease');
assert.equal(getSupervisorLeaseRuntimeMode(), 'degraded-memory');

globalThis.fetch = prevFetch;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetSupervisorLeaseDegradedStateForTests();
__resetSupervisorLeaseMemory();

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(getSupervisorLeaseBootMode(process.env), 'degraded-memory');

console.log('test-supervisor-lease-connectivity: ok');
