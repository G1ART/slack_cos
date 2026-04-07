import assert from 'node:assert';
import {
  tryAcquireSupervisorLease,
  __resetSupervisorLeaseMemory,
  __forceSupervisorLeaseMemoryExpiry,
} from '../src/founder/supervisorLease.js';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetSupervisorLeaseMemory();

const a = await tryAcquireSupervisorLease('owner-a');
assert.equal(a, true);
const b = await tryAcquireSupervisorLease('owner-b');
assert.equal(b, false);

__forceSupervisorLeaseMemoryExpiry();
const c = await tryAcquireSupervisorLease('owner-b');
assert.equal(c, true);

console.log('test-durable-supervisor-lease: ok');
