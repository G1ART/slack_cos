/**
 * W3-B — read-model exports expected source tag strings.
 */
import assert from 'node:assert/strict';
import {
  resolvePersonaContractSnapshotFromTruthSources,
  resolveWorkcellSummaryFromTruthSources,
  TRUTH_SOURCES,
} from '../src/founder/executionContextReadModel.js';

const shell = {
  id: '1',
  run_id: 'r',
  thread_key: 'dm:t',
  status: 'running',
  persona_contract_runtime_snapshot: ['a'],
  workcell_summary_lines: ['w'],
  workcell_runtime: { status: 'active' },
};

let r = resolvePersonaContractSnapshotFromTruthSources({
  active_run_shell: shell,
  execution_summary_active_run: { persona_contract_runtime_snapshot: ['b'] },
  artifacts: [{ type: 'harness_dispatch', payload: { persona_contract_runtime_snapshot: ['c'] } }],
  maxArtifactScan: 8,
});
assert.equal(r.source, TRUTH_SOURCES.ACTIVE_RUN_SHELL);

r = resolvePersonaContractSnapshotFromTruthSources({
  active_run_shell: { id: '1', run_id: 'r', thread_key: 't', status: 'running' },
  execution_summary_active_run: { persona_contract_runtime_snapshot: ['b'] },
  artifacts: [],
  maxArtifactScan: 8,
});
assert.equal(r.source, TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN);

r = resolvePersonaContractSnapshotFromTruthSources({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts: [{ type: 'harness_dispatch', payload: { persona_contract_runtime_snapshot: ['c'] } }],
  maxArtifactScan: 8,
});
assert.equal(r.source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);

r = resolvePersonaContractSnapshotFromTruthSources({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts: [],
  maxArtifactScan: 8,
});
assert.equal(r.source, TRUTH_SOURCES.NONE);

let w = resolveWorkcellSummaryFromTruthSources({
  active_run_shell: shell,
  execution_summary_active_run: { workcell_summary_lines: ['x'] },
  artifacts: [{ type: 'harness_dispatch', payload: { workcell_summary_lines: ['y'] } }],
  maxArtifactScan: 8,
});
assert.equal(w.source, TRUTH_SOURCES.ACTIVE_RUN_SHELL);

w = resolveWorkcellSummaryFromTruthSources({
  active_run_shell: { id: '1', run_id: 'r', thread_key: 't', status: 'running' },
  execution_summary_active_run: { workcell_summary_lines: ['x'] },
  artifacts: [],
  maxArtifactScan: 8,
});
assert.equal(w.source, TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN);

w = resolveWorkcellSummaryFromTruthSources({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts: [{ type: 'harness_dispatch', payload: { workcell_summary_lines: ['y'] } }],
  maxArtifactScan: 8,
});
assert.equal(w.source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);

w = resolveWorkcellSummaryFromTruthSources({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts: [],
  maxArtifactScan: 8,
});
assert.equal(w.source, TRUTH_SOURCES.NONE);

console.log('test-execution-context-read-model-source-tags-w3b: ok');
