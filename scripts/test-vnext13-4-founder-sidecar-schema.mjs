#!/usr/bin/env node
/** vNext.13.4+13.5 — 플래너 정규화·실행 아티팩트 + lineage 검증 */
import assert from 'node:assert/strict';
import {
  normalizePlannerRow,
  validateExecutionArtifactForSpine,
} from '../src/founder/founderArtifactSchemas.js';

const full = normalizePlannerRow({
  natural_language_reply: 'a',
  state_delta: { north_star: 'x' },
  conversation_status: 'exploring',
  proposal_artifact: { understood_request: 'u' },
  approval_artifact: {},
  execution_artifact: {},
  follow_up_questions: ['q'],
  requires_founder_confirmation: false,
});
assert.equal(full.ok, true);
assert.equal(full.sidecar.conversation_status, 'exploring');
assert.equal(full.sidecar.state_delta.north_star, 'x');

const bad = normalizePlannerRow(null);
assert.equal(bad.ok, false);

const preview = {
  latest_proposal_artifact_id: 'p1',
  latest_approval_artifact_id: 'a1',
  last_founder_confirmation_at: '2026-01-01T00:00:00.000Z',
  approval_lineage_status: 'confirmed',
};

assert.equal(validateExecutionArtifactForSpine({}, preview).ok, false);
assert.equal(validateExecutionArtifactForSpine({ request_execution_spine: true }, preview).reason, 'goal');

const good = validateExecutionArtifactForSpine(
  {
    request_execution_spine: true,
    source_proposal_artifact_id: 'p1',
    source_approval_artifact_id: 'a1',
    goal_line: 'g',
    locked_scope_summary: 's',
  },
  preview,
);
assert.equal(good.ok, true);

const wrongId = validateExecutionArtifactForSpine(
  {
    request_execution_spine: true,
    source_proposal_artifact_id: 'other',
    source_approval_artifact_id: 'a1',
    goal_line: 'g',
    locked_scope_summary: 's',
  },
  preview,
);
assert.equal(wrongId.ok, false);
assert.equal(wrongId.reason, 'lineage_id_mismatch');

console.log('ok: vnext13_4_founder_sidecar_schema');
