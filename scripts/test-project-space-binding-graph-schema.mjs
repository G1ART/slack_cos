/**
 * W5-B: supabase/migrations/20260501120000_project_space_binding_graph.sql 이
 * 3 테이블 + 3 enum + RLS + 4 테넄시 컬럼 + project_space_key FK/인덱스를 선언한다.
 * Supabase 에 실제로 적용하진 않고 SQL 텍스트 회귀만 수행(DDL 배포는 담당자 수동).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const MIG_PATH = path.join(REPO_ROOT, 'supabase', 'migrations', '20260501120000_project_space_binding_graph.sql');
const sql = fs.readFileSync(MIG_PATH, 'utf8');

assert.ok(/create type public\.project_space_binding_kind as enum/.test(sql), 'binding_kind enum');
for (const v of ['repo_binding', 'default_branch', 'cursor_root', 'db_binding', 'deploy_binding', 'env_requirement']) {
  assert.ok(sql.includes(`'${v}'`), `binding_kind includes ${v}`);
}
assert.ok(/create type public\.project_space_gate_kind as enum/.test(sql), 'gate_kind enum');
for (const v of ['oauth_authorization', 'billing_or_subscription', 'policy_or_product_decision', 'manual_secret_entry', 'high_risk_approval']) {
  assert.ok(sql.includes(`'${v}'`), `gate_kind includes ${v}`);
}
assert.ok(/create type public\.project_space_gate_status as enum/.test(sql), 'gate_status enum');
for (const v of ['open', 'resolved', 'abandoned']) assert.ok(sql.includes(`'${v}'`), `gate_status includes ${v}`);

assert.ok(/create table if not exists public\.project_spaces/.test(sql));
assert.ok(/create table if not exists public\.project_space_bindings/.test(sql));
assert.ok(/create table if not exists public\.project_space_human_gates/.test(sql));

assert.ok(/project_space_key text primary key/.test(sql), 'project_spaces PK');
assert.ok(/references public\.project_spaces\(project_space_key\) on delete cascade/.test(sql), 'FK present on bindings + gates');

for (const col of ['workspace_key text', 'product_key text', 'parcel_deployment_key text']) {
  const count = sql.split(col).length - 1;
  assert.ok(count >= 3, `tenancy column ${col} present on all 3 tables (got ${count})`);
}

assert.ok(sql.includes('gen_random_uuid()'), 'uuid PK for bindings/gates');

const rlsTables = ['project_spaces', 'project_space_bindings', 'project_space_human_gates'];
for (const t of rlsTables) {
  assert.ok(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `RLS enabled on ${t}`);
  assert.ok(new RegExp(`${t}_service_role_rw`).test(sql), `service_role policy on ${t}`);
  assert.ok(new RegExp(`to service_role`).test(sql), 'service_role audience');
}

assert.ok(sql.includes('idx_project_space_bindings_key_kind'));
assert.ok(sql.includes('idx_project_space_human_gates_key_status'));

assert.ok(sql.includes('Reference name only'), 'binding_ref docs: no secret values');

console.log('test-project-space-binding-graph-schema: ok');
