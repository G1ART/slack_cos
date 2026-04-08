import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendExecutionArtifact, readReviewQueueForRun } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-review-scope');
process.env.COS_RUN_STORE = 'memory';

const tk = 'mention:vnext41_rev_scope:1';
const ridA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ridB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'B blocked',
  status: 'blocked',
  needs_review: true,
  payload: {
    cos_run_id: ridB,
    run_packet_id: 'p_b',
    tool: 'cursor',
    action: 'create_spec',
    result_summary: 'RUN_B_REVIEW_MARKER',
    outcome_code: 'blocked_missing_input',
    blocked_reason: 'b_reason',
  },
});

await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'A degraded',
  status: 'degraded',
  needs_review: true,
  payload: {
    cos_run_id: ridA,
    run_packet_id: 'p_a',
    tool: 'cursor',
    action: 'create_spec',
    result_summary: 'RUN_A_REVIEW_MARKER',
    outcome_code: 'failed_artifact',
  },
});

const runA = {
  id: ridA,
  thread_key: tk,
  dispatch_id: 'd_ra',
  required_packet_ids: ['p_a'],
};

const q = await readReviewQueueForRun(runA, 10);
const summaries = q.map((x) => x.result_summary).join('|');
assert.ok(summaries.includes('RUN_A_REVIEW_MARKER'));
assert.ok(!summaries.includes('RUN_B_REVIEW_MARKER'));

console.log('test-run-scoped-review-queue-does-not-leak-across-runs: ok');
