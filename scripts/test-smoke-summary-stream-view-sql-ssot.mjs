/**
 * Migrations that replace `cos_ops_smoke_summary_stream`: both `event_type in (...)` clauses
 * must match {@link COS_OPS_SMOKE_SUMMARY_EVENT_TYPES} exactly (order + set).
 */
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES } from '../src/founder/runStoreSupabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, '../supabase/migrations');
const allSql = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
const viewFiles = allSql.filter((f) => {
  const c = readFileSync(join(migDir, f), 'utf8');
  return /create\s+or\s+replace\s+view\s+public\.cos_ops_smoke_summary_stream/i.test(c);
});
assert.ok(
  viewFiles.length >= 1,
  `expected at least one migration defining public.cos_ops_smoke_summary_stream, got: ${viewFiles.join(', ') || '(none)'}`,
);

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

const exp = [...COS_OPS_SMOKE_SUMMARY_EVENT_TYPES];
for (const name of viewFiles.sort()) {
  const sql = readFileSync(join(migDir, name), 'utf8');
  const runEventsTypes = parseQuotedTypes(extractInListBody(sql, 'where e.event_type in'));
  const opsSmokeTypes = parseQuotedTypes(extractInListBody(sql, 'where o.event_type in'));
  assert.deepStrictEqual(
    runEventsTypes,
    opsSmokeTypes,
    `${name}: cos_run_events and cos_ops_smoke_events IN lists must be identical`,
  );
  assert.deepStrictEqual(
    runEventsTypes,
    exp,
    `${name}: migration IN list must mirror COS_OPS_SMOKE_SUMMARY_EVENT_TYPES (same order)`,
  );
}

console.log('test-smoke-summary-stream-view-sql-ssot: ok');
