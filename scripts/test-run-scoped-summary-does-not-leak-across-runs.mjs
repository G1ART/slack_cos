import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendExecutionArtifact, readExecutionSummaryForRun } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-summary-scope');
process.env.COS_RUN_STORE = 'memory';

const tk = 'mention:vnext41_sum_scope:1';
const ridA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ridB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'B only line',
  status: 'completed',
  payload: {
    cos_run_id: ridB,
    run_packet_id: 'p_overlap',
    tool: 'cursor',
    action: 'create_spec',
    result_summary: 'b',
    outcome_code: 'artifact_prepared',
    next_required_input: 'RUN_B_SUMMARY_MARKER',
  },
});

await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'A only line',
  status: 'completed',
  payload: {
    cos_run_id: ridA,
    run_packet_id: 'p_overlap',
    tool: 'cursor',
    action: 'create_spec',
    result_summary: 'a',
    outcome_code: 'artifact_prepared',
    next_required_input: 'RUN_A_SUMMARY_MARKER',
  },
});

const runA = {
  id: ridA,
  thread_key: tk,
  dispatch_id: 'd_a',
  required_packet_ids: ['p_overlap'],
};

const lines = await readExecutionSummaryForRun(runA, 10);
const joined = lines.join('\n');
assert.ok(joined.includes('RUN_A_SUMMARY_MARKER'));
assert.ok(!joined.includes('RUN_B_SUMMARY_MARKER'));

console.log('test-run-scoped-summary-does-not-leak-across-runs: ok');
