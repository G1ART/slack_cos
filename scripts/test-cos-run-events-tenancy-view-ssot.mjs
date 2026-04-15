/**
 * cos_run_events_tenancy_stream 뷰 마이그레이션 존재 및 이름이 JS SSOT 와 일치하는지.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COS_RUN_EVENTS_TENANCY_STREAM_VIEW } from '../src/founder/runStoreSupabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, '../supabase/migrations');
const files = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => f.includes('cos_run_events_tenancy_stream_view'));
assert.equal(files.length, 1, `expected exactly one *cos_run_events_tenancy_stream_view*.sql, got: ${files.join(', ')}`);
const sql = readFileSync(join(migDir, files[0]), 'utf8');
assert.match(
  sql,
  new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${COS_RUN_EVENTS_TENANCY_STREAM_VIEW}\\b`, 'i'),
  'migration must define view name matching COS_RUN_EVENTS_TENANCY_STREAM_VIEW',
);

console.log('test-cos-run-events-tenancy-view-ssot: ok');
