/**
 * W3-B — artifact list for read-model excludes conflicting tenancy payload keys.
 */
import assert from 'node:assert/strict';
import { buildExecutionContextReadModel, TRUTH_SOURCES } from '../src/founder/executionContextReadModel.js';

const newerWrongProduct = {
  type: 'harness_dispatch',
  payload: {
    product_key: 'OTHER_PROD',
    persona_contract_runtime_snapshot: ['pm|wrong|v1'],
    workcell_summary_lines: ['wrong workcell'],
  },
};

const olderRightProduct = {
  type: 'harness_dispatch',
  payload: {
    product_key: 'P_TARGET',
    project_space_key: 'PS_TARGET',
    persona_contract_runtime_snapshot: ['pm|right|v1'],
    workcell_summary_lines: ['right workcell'],
  },
};

const shell = {
  id: '1',
  run_id: 'r',
  thread_key: 'dm:t',
  status: 'running',
  product_key: 'P_TARGET',
  project_space_key: 'PS_TARGET',
};

// Order: older first, newer last — scan visits newer first; scoped list drops newer conflict
const artifacts = [olderRightProduct, newerWrongProduct];

const rm = buildExecutionContextReadModel({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts,
  maxArtifactScan: 8,
  activeRow: {
    workspace_key: 'WS',
    product_key: 'P_TARGET',
    project_space_key: 'PS_TARGET',
    parcel_deployment_key: 'PD',
  },
});

assert.equal(rm.artifact_scan_scoped_by_tenancy, true);
assert.deepEqual(rm.persona_contract_snapshot_lines, ['pm|right|v1']);
assert.equal(rm.persona_contract_snapshot_source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);
assert.deepEqual(rm.workcell_summary_lines, ['right workcell']);
assert.equal(rm.workcell_summary_source, TRUTH_SOURCES.RECENT_ARTIFACT_SCAN);

// No tenancy slice → both artifacts kept; newest (wrong product) wins persona tier3 in unscoped scan
const rmLoose = buildExecutionContextReadModel({
  active_run_shell: null,
  execution_summary_active_run: null,
  artifacts,
  maxArtifactScan: 8,
  activeRow: {},
});
assert.equal(rmLoose.artifact_scan_scoped_by_tenancy, false);
assert.deepEqual(rmLoose.persona_contract_snapshot_lines, ['pm|wrong|v1']);

// project_space mismatch dropped
const artPsOk = {
  type: 'harness_dispatch',
  payload: { project_space_key: 'PS_TARGET', persona_contract_runtime_snapshot: ['pm|psok|v1'] },
};
const artPsBad = {
  type: 'harness_dispatch',
  payload: { project_space_key: 'OTHER_PS', persona_contract_runtime_snapshot: ['pm|psbad|v1'] },
};
const rmPs = buildExecutionContextReadModel({
  active_run_shell: shell,
  execution_summary_active_run: null,
  artifacts: [artPsOk, artPsBad],
  maxArtifactScan: 8,
  activeRow: null,
});
assert.equal(rmPs.artifact_scan_scoped_by_tenancy, true);
assert.deepEqual(rmPs.persona_contract_snapshot_lines, ['pm|psok|v1']);

console.log('test-execution-context-read-model-tenancy-scope-w3b: ok');
