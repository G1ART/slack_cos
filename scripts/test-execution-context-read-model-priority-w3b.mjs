/**
 * W3-B — read-model precedence: shell > summary object > artifact scan > none.
 */
import assert from 'node:assert/strict';
import { buildExecutionContextReadModel, TRUTH_SOURCES } from '../src/founder/executionContextReadModel.js';

const shellPersona = ['pm|shell|v1'];
const summaryPersona = ['pm|summary|v1'];
const artifactPersona = ['pm|artifact|v1'];

const shellWork = ['workcell shell line'];
const summaryWork = ['workcell summary line'];
const artifactWork = ['workcell artifact line'];

const artMatch = {
  type: 'harness_dispatch',
  payload: {
    persona_contract_runtime_snapshot: artifactPersona,
    workcell_summary_lines: artifactWork,
    product_key: 'P1',
  },
};

// A: shell wins over summary + artifacts
const a = buildExecutionContextReadModel({
  active_run_shell: {
    id: '1',
    run_id: 'r',
    thread_key: 'dm:t',
    status: 'running',
    persona_contract_runtime_snapshot: shellPersona,
    workcell_summary_lines: shellWork,
    product_key: 'P1',
  },
  execution_summary_active_run: {
    persona_contract_runtime_snapshot: summaryPersona,
    workcell_summary_lines: summaryWork,
  },
  artifacts: [artMatch],
  maxArtifactScan: 8,
  activeRow: null,
});
assert.deepEqual(a.persona_contract_snapshot_lines, shellPersona);
assert.equal(a.persona_contract_snapshot_source, TRUTH_SOURCES.ACTIVE_RUN_SHELL);
assert.deepEqual(a.workcell_summary_lines, shellWork);
assert.equal(a.workcell_summary_source, TRUTH_SOURCES.ACTIVE_RUN_SHELL);

// B: summary object beats artifacts when shell lacks fields
const b = buildExecutionContextReadModel({
  active_run_shell: {
    id: '1',
    run_id: 'r',
    thread_key: 'dm:t',
    status: 'running',
    product_key: 'P1',
  },
  execution_summary_active_run: {
    persona_contract_runtime_snapshot: summaryPersona,
    workcell_summary_lines: summaryWork,
  },
  artifacts: [artMatch],
  maxArtifactScan: 8,
  activeRow: null,
});
assert.deepEqual(b.persona_contract_snapshot_lines, summaryPersona);
assert.equal(b.persona_contract_snapshot_source, TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN);
assert.deepEqual(b.workcell_summary_lines, summaryWork);
assert.equal(b.workcell_summary_source, TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN);

// C: malformed summary (wrong snapshot type) → artifact scan
const c = buildExecutionContextReadModel({
  active_run_shell: {
    id: '1',
    run_id: 'r',
    thread_key: 'dm:t',
    status: 'running',
    product_key: 'P1',
  },
  execution_summary_active_run: {
    persona_contract_runtime_snapshot: 'not-an-array',
    workcell_summary_lines: 12345,
  },
  artifacts: [artMatch],
  maxArtifactScan: 8,
  activeRow: null,
});
assert.deepEqual(c.persona_contract_snapshot_lines, artifactPersona);
assert.equal(c.persona_contract_snapshot_source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);
assert.deepEqual(c.workcell_summary_lines, artifactWork);
assert.equal(c.workcell_summary_source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);

// D: none
const d = buildExecutionContextReadModel({
  active_run_shell: null,
  execution_summary_active_run: ['line1'],
  artifacts: [],
  maxArtifactScan: 8,
  activeRow: null,
});
assert.deepEqual(d.persona_contract_snapshot_lines, []);
assert.equal(d.persona_contract_snapshot_source, TRUTH_SOURCES.NONE);
assert.deepEqual(d.workcell_summary_lines, []);
assert.equal(d.workcell_summary_source, TRUTH_SOURCES.NONE);

console.log('test-execution-context-read-model-priority-w3b: ok');
