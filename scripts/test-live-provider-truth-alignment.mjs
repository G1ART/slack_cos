#!/usr/bin/env node
/**
 * Live provider activation + provider truth alignment (Cursor / Supabase / founder-facing).
 * Uses fetch stub (no listen) so tests run in sandboxed CI.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const savedFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('__cos_test_cursor__')) {
    return new Response(
      JSON.stringify({
        run_ref: 'cursor-mock-ref',
        conversation_url: 'https://example.test/cursor/1',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (u.includes('__cos_test_sb__')) {
    return new Response(JSON.stringify({ apply_ref: 'job-xyz' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return savedFetch.call(globalThis, url, init);
};

let passed = 0;
let failed = 0;

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-live-prov-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');

const {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunById,
  clearExecutionRunsForTest,
} = await import('../src/features/executionRun.js');

const {
  ensureCursorOutboundForRun,
  tryEnsureSupabaseLiveOrDraftForRun,
} = await import('../src/features/executionOutboundOrchestrator.js');

const { buildProviderTruthSnapshot } = await import('../src/core/providerTruthSnapshot.js');

function ok(name) {
  passed++;
  console.log(`  PASS: ${name}`);
}
function fail(name, e) {
  failed++;
  console.error(`  FAIL: ${name}`, e?.message || e);
}

function makeTestRun(overrides = {}) {
  clearExecutionRunsForTest();
  const packet = createExecutionPacket({
    thread_key: overrides.thread_key || 'ch:LIVEP:1000.1001',
    goal_line: overrides.goal || 'Supabase DB + 앱',
    locked_scope_summary: overrides.summary || 'MVP',
    includes: overrides.includes || ['schema', 'user table'],
    excludes: [],
    deferred_items: [],
    approval_rules: [],
    session_id: '',
    requested_by: 'U_T',
  });
  return createExecutionRun({
    packet,
    metadata: { user: 'U_T', channel: 'C_T' },
    playbook_id: 'PBK-t',
    task_kind: 'task',
  });
}

/* Cursor live: fetch stub */
try {
  delete process.env.COS_CURSOR_CLOUD_DISABLE;
  process.env.COS_CURSOR_CLOUD_LAUNCH_URL = 'https://hooks.example/__cos_test_cursor__/launch';

  const run = makeTestRun();
  const out = await ensureCursorOutboundForRun(run, { channel: 'C_T' });
  assert.equal(out.mode, 'live');
  assert.equal(out.run_ref, 'cursor-mock-ref');

  const r = getExecutionRunById(run.run_id);
  assert.equal(r.artifacts.fullstack_swe.cursor_cloud_run_ref, 'cursor-mock-ref');
  assert.ok(!r.artifacts.fullstack_swe.cursor_handoff_path, 'no handoff when live');
  const lastCt = r.cursor_trace[r.cursor_trace.length - 1];
  assert.equal(lastCt.dispatch_mode, 'live');
  assert.equal(lastCt.cursor_fallback_used, false);

  const snap = buildProviderTruthSnapshot({ space: null, run: r });
  const cur = snap.providers.find((p) => p.provider === 'cursor_cloud');
  assert.equal(cur.status, 'live');

  delete process.env.COS_CURSOR_CLOUD_LAUNCH_URL;
  clearExecutionRunsForTest();
  ok('cursor live path: no handoff, truth live');
} catch (e) {
  fail('cursor live path', e);
}

/* Cursor fallback: no URL → handoff */
try {
  delete process.env.COS_CURSOR_CLOUD_LAUNCH_URL;
  const run = makeTestRun();
  const out = await ensureCursorOutboundForRun(run, {});
  assert.equal(out.mode, 'manual_bridge');
  assert.ok(out.handoff_path);

  const r = getExecutionRunById(run.run_id);
  const lastCt = r.cursor_trace[r.cursor_trace.length - 1];
  assert.equal(lastCt.dispatch_mode, 'manual_bridge');
  assert.equal(lastCt.cursor_fallback_used, false);

  const snap = buildProviderTruthSnapshot({ space: null, run: r });
  const cur = snap.providers.find((p) => p.provider === 'cursor_cloud');
  assert.equal(cur.status, 'manual_bridge');

  await fs.unlink(path.resolve(process.cwd(), out.handoff_path)).catch(() => {});
  clearExecutionRunsForTest();
  ok('cursor unavailable: handoff, truth manual_bridge');
} catch (e) {
  fail('cursor fallback', e);
}

/* Supabase: configured space only → draft_only, never live */
try {
  const snap = buildProviderTruthSnapshot({
    space: { supabase_project_ref: 'abcd', supabase_ready_status: 'configured' },
    run: null,
  });
  const sb = snap.providers.find((p) => p.provider === 'supabase');
  assert.equal(sb.status, 'draft_only');
  assert.notEqual(sb.status, 'live');
  ok('supabase space-only truth is draft_only');
} catch (e) {
  fail('supabase draft_only truth', e);
}

/* Supabase live dispatch via fetch stub */
try {
  process.env.COS_SUPABASE_LIVE_DISPATCH_URL = 'https://worker.example/__cos_test_sb__/hook';
  delete process.env.COS_SUPABASE_LIVE_DISABLE;

  const run = makeTestRun({
    goal: 'DB 마이그레이션',
    includes: ['table', 'schema migration'],
  });
  const res = await tryEnsureSupabaseLiveOrDraftForRun(run);
  assert.equal(res.mode, 'live');
  assert.ok(res.migration_path);

  const r = getExecutionRunById(run.run_id);
  const snap = buildProviderTruthSnapshot({ space: null, run: r });
  const sb = snap.providers.find((p) => p.provider === 'supabase');
  assert.equal(sb.status, 'live');

  await fs.unlink(path.resolve(process.cwd(), r.artifacts.fullstack_swe.supabase_schema_draft_path)).catch(() => {});
  await fs.unlink(path.resolve(process.cwd(), res.migration_path)).catch(() => {});

  delete process.env.COS_SUPABASE_LIVE_DISPATCH_URL;
  clearExecutionRunsForTest();
  ok('supabase live dispatch: truth live + trace');
} catch (e) {
  fail('supabase live dispatch', e);
}

clearExecutionRunsForTest();
await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;

globalThis.fetch = savedFetch;

console.log('');
console.log(`LIVE PROVIDER TRUTH: passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
