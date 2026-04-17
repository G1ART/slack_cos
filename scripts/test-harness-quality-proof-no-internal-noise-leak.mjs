/**
 * W13-E — compact lines 는 내부 토큰/식별자(run_id/packet_id/resolution_class/team_shape 원시 키)
 * 를 founder 표면에 노출하지 않는다. 한국어 자연어 설명만 허용된다.
 */
import assert from 'node:assert/strict';
import {
  buildHarnessQualityProofReadModel,
  toQualityProofCompactLines,
} from '../src/founder/harnessQualityProofReadModel.js';

const rm = buildHarnessQualityProofReadModel({
  workcell_sessions: [
    {
      reviewer_findings_count: 2,
      rework_cause_code: 'reviewer_finding',
      acceptance_evidence_kind: 'test_pass',
    },
  ],
  scenario_envelopes: [
    {
      scenario_id: 'scenario1_ps_alpha',
      outcome: 'broken',
      delivery_ready: true,
      resolution_class: 'hil_required_external_auth',
      break_location: 'external_auth',
    },
  ],
  human_gate_rows: [
    {
      id: 'gate-xyz',
      reopened_count: 1,
      continuation_run_id: 'run:confidential-123',
      resume_target_kind: 'run',
      resume_target_ref: 'run:confidential-123',
    },
  ],
  run_rows: [
    { run_id: 'run-sensitive-abc', outcome: 'failed', team_shape: 'solo' },
  ],
});

const lines = toQualityProofCompactLines(rm);
assert.ok(lines.length > 0, 'sanity: should emit lines');
const forbidden = [
  'run:',
  'run_id',
  'packet_id',
  'resolution_class',
  'hil_required',
  'break_location',
  'external_auth',
  'gate-xyz',
  'reviewer_finding',
  'acceptance_evidence_kind',
  'scenario1_ps_alpha',
  'confidential-123',
  'sensitive-abc',
];
for (const ln of lines) {
  for (const tok of forbidden) {
    assert.ok(!ln.includes(tok), `founder-facing line leaked internal token: ${tok} in "${ln}"`);
  }
  // No obvious code/tech fragments like "=", "{", "}"
  assert.ok(!/[{}=]/.test(ln), `founder-facing line contains code-ish fragment: "${ln}"`);
}

console.log('test-harness-quality-proof-no-internal-noise-leak: ok');
