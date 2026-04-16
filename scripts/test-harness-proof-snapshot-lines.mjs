#!/usr/bin/env node
/**
 * W6-B regression #4 — executionContextReadModel.harness_proof_snapshot_lines 가
 *  1) active_run_shell.workcell_runtime 에서 proof 필드를 끌어오고
 *  2) 값이 없으면 빈 배열을 반환하고
 *  3) formatHarnessProofSnapshotLines 가 reviewer_findings / rework / acceptance / rate / delta 를 포함한다.
 */

import assert from 'node:assert/strict';

import {
  buildHarnessWorkcellRuntime,
  formatHarnessProofSnapshotLines,
} from '../src/founder/harnessWorkcellRuntime.js';
import { buildExecutionContextReadModel } from '../src/founder/executionContextReadModel.js';

// 1) runtime 에 proof 값이 있으면 compact lines 에 반영
{
  const build = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_snap',
    personas: ['research', 'pm'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
        reviewer_findings_count: 4,
      },
      {
        packet_id: 'p2', persona: 'pm', owner_persona: 'pm',
        review_required: false,
        rework_requested: true,
        rework_cause_code: 'reviewer_finding',
        acceptance_evidence_kind: 'reviewer_sign_off',
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze', 'pm: scope'],
    correction_hit_rate: 0.6,
    patch_quality_delta: 0.1,
  });
  assert.equal(build.ok, true);
  const wc = build.workcell_runtime;
  const lines = formatHarnessProofSnapshotLines(wc, 6);
  assert.ok(lines.some((l) => /reviewer_findings=4/.test(l)));
  assert.ok(lines.some((l) => /rework_cause=reviewer_finding/.test(l)));
  assert.ok(lines.some((l) => /acceptance=reviewer_sign_off/.test(l)));
  assert.ok(lines.some((l) => /correction_hit_rate=0\.6/.test(l)));
  assert.ok(lines.some((l) => /patch_quality_delta=0\.1/.test(l)));

  // 2) ReadModel 이 shell 의 workcell_runtime 에서 같은 lines 를 추출한다
  const rm = buildExecutionContextReadModel({
    active_run_shell: { workcell_runtime: wc },
    execution_summary_active_run: null,
    artifacts: [],
    maxArtifactScan: 8,
    activeRow: null,
  });
  assert.ok(Array.isArray(rm.harness_proof_snapshot_lines), 'read model exposes snapshot lines array');
  assert.ok(rm.harness_proof_snapshot_lines.length >= 4);
  assert.ok(rm.harness_proof_snapshot_lines.some((l) => /reviewer_findings=4/.test(l)));
}

// 3) shell 에 workcell_runtime 이 없으면 빈 배열
{
  const rm = buildExecutionContextReadModel({
    active_run_shell: { persona_contract_runtime_snapshot: ['research: analyze'] },
    execution_summary_active_run: null,
    artifacts: [],
    maxArtifactScan: 8,
    activeRow: null,
  });
  assert.deepEqual(rm.harness_proof_snapshot_lines, []);
}

// 4) artifacts 에서도 fallback 으로 proof lines 를 추출한다
{
  const build = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_snap_artifact',
    personas: ['research'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
        reviewer_findings_count: 2,
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
  });
  assert.equal(build.ok, true);
  const artifact = {
    type: 'harness_dispatch',
    payload: { workcell_runtime: build.workcell_runtime },
  };
  const rm = buildExecutionContextReadModel({
    active_run_shell: null,
    execution_summary_active_run: null,
    artifacts: [artifact],
    maxArtifactScan: 8,
    activeRow: null,
  });
  assert.ok(rm.harness_proof_snapshot_lines.some((l) => /reviewer_findings=2/.test(l)));
}

console.log('test-harness-proof-snapshot-lines: ok');
