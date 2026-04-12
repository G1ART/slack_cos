/**
 * Migration `*_cos_ops_smoke_summary_stream_view.sql`: both `event_type in (...)` clauses
 * must match {@link COS_OPS_SMOKE_SUMMARY_EVENT_TYPES} exactly (order + set).
 */
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES } from '../src/founder/runStoreSupabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, '../supabase/migrations');
const names = readdirSync(migDir).filter((f) => f.endsWith('.sql') && f.includes('cos_ops_smoke_summary_stream_view'));
assert.equal(
  names.length,
  1,
  `expected exactly one *cos_ops_smoke_summary_stream_view*.sql in migrations, got: ${names.join(', ') || '(none)'}`,
);

const sql = readFileSync(join(migDir, names[0]), 'utf8');

/** @param {string} s @param {string} needle */
function extractInListBody(s, needle) {
  const i = s.indexOf(needle);
  assert.ok(i >= 0, `missing: ${needle}`);
  let j = i + needle.length;
  while (j < s.length && /\s/.test(s[j])) j++;
  assert.equal(s[j], '(', `expected '(' after ${needle}`);
  let depth = 1;
  const start = j + 1;
  j++;
  while (j < s.length && depth > 0) {
    const c = s[j];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    j++;
  }
  assert.equal(depth, 0, 'unbalanced parentheses in IN list');
  return s.slice(start, j - 1);
}

/** @param {string} body */
function parseQuotedTypes(body) {
  return body
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((token) => {
      const m = /^'([^']+)'$/.exec(token);
      assert.ok(m, `expected single-quoted event_type, got: ${token}`);
      return m[1];
    });
}

const runEventsTypes = parseQuotedTypes(extractInListBody(sql, 'where e.event_type in'));
const opsSmokeTypes = parseQuotedTypes(extractInListBody(sql, 'where o.event_type in'));

assert.deepStrictEqual(
  runEventsTypes,
  opsSmokeTypes,
  'cos_run_events and cos_ops_smoke_events IN lists must be identical',
);
assert.deepStrictEqual(
  runEventsTypes,
  [...COS_OPS_SMOKE_SUMMARY_EVENT_TYPES],
  'migration IN list must mirror COS_OPS_SMOKE_SUMMARY_EVENT_TYPES (same order)',
);

console.log('test-smoke-summary-stream-view-sql-ssot: ok');
