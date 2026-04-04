#!/usr/bin/env node
import assert from 'node:assert/strict';
import { tryResolveFounderDeterministicUtility } from '../src/founder/founderDeterministicUtilityResolver.js';
import { founderTruthClosureWording } from '../src/founder/founderTruthClosureWording.js';
import { evaluateExecutionRunCompletion } from '../src/features/executionDispatchLifecycle.js';

const noTruth = founderTruthClosureWording(
  { overall_status: 'pending', completion_source: 'truth_reconciliation' },
  { hasTruthEntries: false },
);
assert.ok(String(noTruth.founder_phrase).includes('아직 미완료'));
assert.ok(String(noTruth.founder_phrase).includes('truth_reconciliation'));

const partial = founderTruthClosureWording(
  { overall_status: 'partial', completion_source: 'truth_reconciliation' },
  { hasTruthEntries: true },
);
assert.ok(String(partial.founder_phrase).includes('일부만'));

const draft = founderTruthClosureWording(
  { overall_status: 'draft_only', completion_source: 'truth_reconciliation' },
  { hasTruthEntries: true },
);
assert.ok(String(draft.founder_phrase).includes('초안'));

const done = founderTruthClosureWording(
  { overall_status: 'completed', completion_source: 'truth_reconciliation' },
  { hasTruthEntries: true },
);
assert.ok(String(done.founder_phrase).includes('완료'));

const meta = { source_type: 'direct_message', channel: 'Dcl', user: 'Ux', ts: '1.0', thread_ts: '1.0' };
const closureAsk = tryResolveFounderDeterministicUtility({
  normalized: '이 스레드 실행 끝났나?',
  threadKey: `${meta.channel}:${meta.thread_ts || meta.ts}`,
  metadata: { ...meta, founder_explicit_meta_utility_path: true },
});
assert.equal(closureAsk.handled, true);
assert.equal(closureAsk.kind, 'completion_closure');
assert.ok(String(closureAsk.text).includes('truth_reconciliation'));

const evNull = evaluateExecutionRunCompletion('nonexistent-run-id');
assert.equal(evNull, null);

console.log('ok: vnext13_3_founder_status_closure_contract');
