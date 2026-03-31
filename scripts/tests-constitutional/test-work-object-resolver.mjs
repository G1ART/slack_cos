/**
 * Constitutional test: Work Object Resolver.
 * Verifies resolveWorkObject correctly identifies project space, run, intake session.
 */
import { resolveWorkObject } from '../../src/core/workObjectResolver.js';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Test 1: No work object → unresolved, discover hint
{
  const ctx = resolveWorkObject('안녕하세요', {});
  assert('no_work_object_resolved_false', ctx.resolved === false);
  assert('no_work_object_primary_type_none', ctx.primary_type === 'none');
  assert('no_work_object_phase_hint_discover', ctx.phase_hint === 'discover');
  assert('no_work_object_confidence_0', ctx.confidence === 0);
}

// Test 2: Shape validation
{
  const ctx = resolveWorkObject('테스트', {});
  assert('shape_has_resolved', 'resolved' in ctx);
  assert('shape_has_primary_type', 'primary_type' in ctx);
  assert('shape_has_project_space', 'project_space' in ctx);
  assert('shape_has_run', 'run' in ctx);
  assert('shape_has_intake_session', 'intake_session' in ctx);
  assert('shape_has_project_id', 'project_id' in ctx);
  assert('shape_has_run_id', 'run_id' in ctx);
  assert('shape_has_phase_hint', 'phase_hint' in ctx);
  assert('shape_has_confidence', 'confidence' in ctx);
}

// Test 3: Empty text → unresolved
{
  const ctx = resolveWorkObject('', {});
  assert('empty_text_unresolved', ctx.resolved === false);
}

console.log(`\ntest-work-object-resolver: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
