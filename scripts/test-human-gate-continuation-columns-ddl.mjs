/**
 * W8-B — DDL 정합: project_space_human_gates 에 continuation_* / required_human_action 컬럼이
 * additive 로 추가되었는지, propagation_runs / propagation_steps / delivery_readiness_snapshots 테이블이
 * 마이그레이션 파일에 존재하는지 정적 검증.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const migPath = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260601120000_binding_propagation_and_continuation.sql',
);
assert.ok(fs.existsSync(migPath), 'W8-B migration exists');

const sql = fs.readFileSync(migPath, 'utf8');

// 1) continuation 컬럼은 additive ALTER 로만 붙임 (DROP COLUMN / RENAME 금지)
assert.ok(/alter table public\.project_space_human_gates/i.test(sql), 'alter table present');
assert.ok(/add column if not exists continuation_packet_id text/i.test(sql));
assert.ok(/add column if not exists continuation_run_id text/i.test(sql));
assert.ok(/add column if not exists continuation_thread_key text/i.test(sql));
assert.ok(/add column if not exists required_human_action text/i.test(sql));
assert.ok(!/drop column/i.test(sql), 'no drop column (additive only)');
assert.ok(!/rename column/i.test(sql), 'no rename column');

// 2) propagation_runs / steps / delivery_readiness_snapshots 테이블 정의 존재
assert.ok(/create table if not exists public\.propagation_runs/i.test(sql));
assert.ok(/create table if not exists public\.propagation_steps/i.test(sql));
assert.ok(/create table if not exists public\.delivery_readiness_snapshots/i.test(sql));

// 3) RLS service_role only
assert.ok(/propagation_runs_service_role_rw/i.test(sql));
assert.ok(/propagation_steps_service_role_rw/i.test(sql));
assert.ok(/delivery_readiness_snapshots_service_role_rw/i.test(sql));

// 4) FK on project_space_key (cascade on delete)
const fkRe = /references public\.project_spaces\(project_space_key\)\s+on delete cascade/gi;
const fkCount = (sql.match(fkRe) || []).length;
assert.ok(fkCount >= 2, `expected >=2 FK cascades on project_spaces(project_space_key), got ${fkCount}`);

// 5) status · verification enum 존재
assert.ok(/propagation_run_status/i.test(sql));
assert.ok(/propagation_step_verification_kind/i.test(sql));
assert.ok(/propagation_step_verification_result/i.test(sql));
assert.ok(/delivery_readiness_verdict/i.test(sql));

console.log('test-human-gate-continuation-columns-ddl: ok');
