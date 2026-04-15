/**
 * cos_runs_recent_by_tenancy RPC 마이그레이션 존재 및 이름이 JS SSOT 와 일치하는지.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COS_RUNS_RECENT_BY_TENANCY_RPC,
  supabaseRpcCosRunsRecentByTenancy,
} from '../src/founder/runStoreSupabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith('.sql') && f.includes('cos_runs_recent_by_tenancy'));
assert.equal(files.length, 1, `expected one *cos_runs_recent_by_tenancy*.sql, got: ${files.join(', ')}`);
const sql = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
assert.match(
  sql,
  new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${COS_RUNS_RECENT_BY_TENANCY_RPC}\\b`, 'i'),
  'migration must define RPC name matching COS_RUNS_RECENT_BY_TENANCY_RPC',
);
assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.cos_runs_recent_by_tenancy/i, 'service_role execute grant');

assert.equal(typeof supabaseRpcCosRunsRecentByTenancy, 'function', 'export supabaseRpcCosRunsRecentByTenancy');

console.log('test-cos-runs-recent-by-tenancy-rpc-ssot: ok');
