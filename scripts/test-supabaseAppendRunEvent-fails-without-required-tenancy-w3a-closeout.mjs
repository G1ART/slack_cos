/**
 * W3-A closeout: supabaseAppendRunEvent no-ops insert when payload tenancy is incomplete.
 */
import assert from 'node:assert/strict';
import { supabaseAppendRunEvent } from '../src/founder/runStoreSupabase.js';

/** @type {Array<{ table: string, row: Record<string, unknown> }>} */
const inserts = [];
const sb = {
  from(table) {
    return {
      async insert(row) {
        inserts.push({ table, row: row && typeof row === 'object' ? row : {} });
        return { error: null };
      },
    };
  },
};

await supabaseAppendRunEvent(sb, '00000000-0000-4000-8000-000000000099', 'ops_smoke_phase', { phase: 'x' }, {});
assert.equal(inserts.length, 0);

await supabaseAppendRunEvent(
  sb,
  '00000000-0000-4000-8000-000000000099',
  'ops_smoke_phase',
  {
    workspace_key: 'w',
    product_key: 'p',
    project_space_key: 's',
    parcel_deployment_key: 'd',
    phase: 'cursor_trigger_recorded',
  },
  {},
);
assert.equal(inserts.length, 1);
assert.equal(inserts[0].table, 'cos_run_events');
assert.equal(String(inserts[0].row.run_id || ''), '00000000-0000-4000-8000-000000000099');

console.log('test-supabaseAppendRunEvent-fails-without-required-tenancy-w3a-closeout: ok');
