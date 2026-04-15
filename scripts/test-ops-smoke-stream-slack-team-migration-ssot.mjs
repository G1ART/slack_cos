/**
 * M0: slack_team_id 열이 ops smoke 스트림·ledger 테넩시 뷰 마이그레이션에 포함되는지.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, '../supabase/migrations');
const files = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => f.includes('slack_team_id_on_smoke_and_ledger_views'));
assert.equal(files.length, 1, `expected one *slack_team_id_on_smoke_and_ledger_views*.sql, got: ${files.join(', ')}`);
const sql = readFileSync(join(migDir, files[0]), 'utf8');
assert.match(sql, /create\s+or\s+replace\s+view\s+public\.cos_ops_smoke_summary_stream/i);
assert.match(sql, /create\s+or\s+replace\s+view\s+public\.cos_run_events_tenancy_stream/i);
assert.match(sql, /slack_team_id/i);

console.log('test-ops-smoke-stream-slack-team-migration-ssot: ok');
