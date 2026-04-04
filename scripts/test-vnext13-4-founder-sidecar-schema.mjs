#!/usr/bin/env node
/** vNext.13.4 — 플래너 정규화·실행 아티팩트 검증 경계 */
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

assert.equal(validateExecutionArtifactForSpine({}).ok, false);
assert.equal(validateExecutionArtifactForSpine({ request_execution_spine: true }).reason, 'lineage');
const good = validateExecutionArtifactForSpine({
  request_execution_spine: true,
  approval_lineage_confirmed: true,
  goal_line: 'g',
  locked_scope_summary: 's',
});
assert.equal(good.ok, true);

console.log('ok: vnext13_4_founder_sidecar_schema');
