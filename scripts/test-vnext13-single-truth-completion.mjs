#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
} from '../src/features/executionRun.js';
import { evaluateExecutionRunCompletion } from '../src/features/executionDispatchLifecycle.js';

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V13:stc:1',
  goal_line: 'truth completion',
  locked_scope_summary: 't',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {} });
const ev = evaluateExecutionRunCompletion(run.run_id);
assert.ok(ev);
assert.equal(ev.completion_source, 'truth_reconciliation');

console.log('ok: vnext13_single_truth_completion');
