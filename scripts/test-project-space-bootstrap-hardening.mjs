#!/usr/bin/env node
/**
 * Thread-first project space bootstrap — label reuse 보수화·격리 회귀.
 */
import assert from 'node:assert/strict';
import {
  _resetForTest as resetSpaces,
  createProjectSpace,
  linkThreadToProjectSpace,
  linkRunToProjectSpace,
  listProjectSpaces,
  computeGoalFingerprint,
  updateProjectSpace,
} from '../src/features/projectSpaceRegistry.js';
import { getOrCreateProjectSpaceForBootstrap, bootstrapProjectSpace } from '../src/features/projectSpaceBootstrap.js';
import {
  clearExecutionRunsForTest,
  createExecutionPacket,
  createExecutionRun,
} from '../src/features/executionRun.js';
import { clearProjectIntakeSessionsForTest } from '../src/features/projectIntakeSession.js';

let passed = 0;
let failed = 0;
function ok(name) {
  passed++;
  console.log(`  PASS: ${name}`);
}
function fail(name, e) {
  failed++;
  console.error(`  FAIL: ${name}`, e?.message || e);
}

function resetAll() {
  clearExecutionRunsForTest();
  clearProjectIntakeSessionsForTest();
  resetSpaces();
}

console.log('\n=== Project space bootstrap hardening ===\n');

/* 1) Same thread re-entry → thread_linked, same space */
try {
  resetAll();
  const tk = 'im:hard-same-1';
  const label = `SameThread-${Date.now()}`;
  const a = bootstrapProjectSpace({ label, threadKey: tk });
  assert.equal(a.reused, false);
  assert.equal(a.resolution.project_space_resolution_mode, 'new_bootstrap');
  const b = bootstrapProjectSpace({ label: 'other words', threadKey: tk });
  assert.equal(b.reused, true);
  assert.equal(b.space.project_id, a.space.project_id);
  assert.equal(b.resolution.project_space_resolution_mode, 'thread_linked');
  ok('same thread re-entry uses thread_linked');
} catch (e) {
  fail('same thread', e);
}

/* 2) Different thread, same exact human_label → new space (no silent reuse) */
try {
  resetAll();
  const label = `SharedExact-${Date.now()}`;
  const s1 = bootstrapProjectSpace({ label, threadKey: 'im:hard-a' });
  const s2 = bootstrapProjectSpace({ label, threadKey: 'im:hard-b' });
  assert.notEqual(s1.space.project_id, s2.space.project_id);
  assert.equal(s2.resolution.project_space_resolution_mode, 'new_bootstrap');
  assert.equal(listProjectSpaces().length, 2);
  ok('different thread same label → new_bootstrap');
} catch (e) {
  fail('different thread', e);
}

/* 3) Exact alias reuse when space has no other thread owners and no cross-thread active run */
try {
  resetAll();
  const alias = `alias-only-${Date.now()}`;
  createProjectSpace({ human_label: 'Long human title for ops', aliases: [alias] });
  const r = bootstrapProjectSpace({ label: alias, threadKey: 'im:hard-alias' });
  assert.equal(r.reused, true);
  assert.equal(r.resolution.project_space_resolution_mode, 'label_match_reuse');
  ok('exact alias safe reuse');
} catch (e) {
  fail('alias reuse', e);
}

/* 4) Active run on another thread blocks label reuse → new space */
try {
  resetAll();
  const label = `CrossRun-${Date.now()}`;
  const { space } = bootstrapProjectSpace({ label, threadKey: 'im:hard-run-a' });
  const pkt = createExecutionPacket({
    thread_key: 'im:hard-run-a',
    goal_line: label,
    locked_scope_summary: label,
    includes: [],
    excludes: [],
    deferred_items: [],
    approval_rules: [],
    session_id: 'im:hard-run-a',
    requested_by: 'U1',
    project_id: space.project_id,
    project_label: space.human_label,
  });
  const run = createExecutionRun({
    packet: pkt,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  linkRunToProjectSpace(space.project_id, run.run_id);

  const rB = bootstrapProjectSpace({ label, threadKey: 'im:hard-run-b' });
  assert.equal(rB.resolution.project_space_resolution_mode, 'new_bootstrap');
  assert.notEqual(rB.space.project_id, space.project_id);
  ok('active run other thread blocks label reuse');
} catch (e) {
  fail('cross-thread run', e);
}

/* 5) Fingerprint mismatch blocks reuse (same label text different fingerprint via stored meta) */
try {
  resetAll();
  const label = `FpGate-${Date.now()}`;
  const s0 = createProjectSpace({ human_label: label, aliases: [] });
  updateProjectSpace(s0.project_id, {
    owner_thread_ids: [],
    last_goal_fingerprint: 'intentionally|wrong|tokens',
  });
  const r = getOrCreateProjectSpaceForBootstrap({ label, threadKey: 'im:hard-fp' });
  assert.equal(r.reused, false);
  assert.equal(r.resolution.project_space_resolution_mode, 'new_bootstrap');
  ok('fingerprint mismatch → new_bootstrap');
} catch (e) {
  fail('fingerprint gate', e);
}

/* 6) explicit_project_id */
try {
  resetAll();
  const s = createProjectSpace({ human_label: 'Explicit', aliases: [] });
  const r = getOrCreateProjectSpaceForBootstrap({ projectId: s.project_id, label: 'x' });
  assert.equal(r.reused, true);
  assert.equal(r.resolution.project_space_resolution_mode, 'explicit_project_id');
  ok('explicit_project_id');
} catch (e) {
  fail('explicit id', e);
}

/* 7) Determinism: two identical fresh sequences → same mode sequence */
try {
  const runSequence = () => {
    resetAll();
    const label = `Det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tk = 'im:hard-det';
    const first = bootstrapProjectSpace({ label, threadKey: tk });
    const second = bootstrapProjectSpace({ label, threadKey: tk });
    return [first.resolution.project_space_resolution_mode, second.resolution.project_space_resolution_mode];
  };
  const seqA = runSequence();
  const seqB = runSequence();
  assert.deepEqual(seqA, seqB);
  assert.deepEqual(seqA, ['new_bootstrap', 'thread_linked']);
  ok('determinism mode sequence');
} catch (e) {
  fail('determinism', e);
}

/* 8) computeGoalFingerprint stable */
try {
  const fp1 = computeGoalFingerprint('더그린  갤러리!!  MVP');
  const fp2 = computeGoalFingerprint('더그린 갤러리 MVP');
  assert.equal(fp1, fp2);
  ok('goal fingerprint normalization');
} catch (e) {
  fail('fingerprint', e);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
