#!/usr/bin/env node
/** vNext.13.5 — execution artifact lineage: state cross-check; boolean self-claim insufficient */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  validateExecutionArtifactForSpine,
  buildFounderLineagePreview,
} from '../src/founder/founderArtifactSchemas.js';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';

const eaBase = {
  request_execution_spine: true,
  goal_line: 'crosscheck goal',
  locked_scope_summary: 'crosscheck scope',
  source_proposal_artifact_id: 'lc-p1',
  source_approval_artifact_id: 'lc-a1',
};

const sidecarOk = {
  state_delta: {
    latest_proposal_artifact_id: 'lc-p1',
    latest_approval_artifact_id: 'lc-a1',
    last_founder_confirmation_at: '2026-04-04T12:00:00.000Z',
    last_founder_confirmation_kind: 'test',
    approval_lineage_status: 'confirmed',
  },
  proposal_artifact: { _cos_artifact_id: 'lc-p1' },
  approval_artifact: { _cos_artifact_id: 'lc-a1' },
};

const previewOk = buildFounderLineagePreview({}, { ...sidecarOk, state_delta: { ...sidecarOk.state_delta } });

const withBoolean = validateExecutionArtifactForSpine(
  { ...eaBase, approval_lineage_confirmed: true },
  previewOk,
);
assert.equal(withBoolean.ok, true);

const badIds = validateExecutionArtifactForSpine(
  { ...eaBase, source_proposal_artifact_id: 'wrong' },
  previewOk,
);
assert.equal(badIds.ok, false);
assert.equal(badIds.reason, 'lineage_id_mismatch');

const previewNoConf = buildFounderLineagePreview(
  {},
  {
    state_delta: {
      latest_proposal_artifact_id: 'lc-p1',
      latest_approval_artifact_id: 'lc-a1',
      approval_lineage_status: 'confirmed',
    },
    proposal_artifact: { _cos_artifact_id: 'lc-p1' },
    approval_artifact: { _cos_artifact_id: 'lc-a1' },
  },
);
assert.equal(validateExecutionArtifactForSpine(eaBase, previewNoConf).reason, 'no_founder_confirmation');

const previewPending = buildFounderLineagePreview(
  {},
  {
    state_delta: {
      latest_proposal_artifact_id: 'lc-p1',
      latest_approval_artifact_id: 'lc-a1',
      last_founder_confirmation_at: '2026-04-04T12:00:00.000Z',
      approval_lineage_status: 'pending',
    },
    proposal_artifact: { _cos_artifact_id: 'lc-p1' },
    approval_artifact: { _cos_artifact_id: 'lc-a1' },
  },
);
assert.equal(validateExecutionArtifactForSpine(eaBase, previewPending).reason, 'lineage_not_confirmed');

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v135-lineage-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'runs.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const meta = {
  source_type: 'direct_message',
  channel: 'Dlc1',
  user: 'Ulc',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: {
    natural_language_reply: '',
    state_delta: {
      latest_proposal_artifact_id: 'lc-p1',
      latest_approval_artifact_id: 'lc-a1',
      approval_lineage_status: 'confirmed',
    },
    conversation_status: 'execution_ready',
    proposal_artifact: { _cos_artifact_id: 'lc-p1' },
    approval_artifact: { _cos_artifact_id: 'lc-a1' },
    execution_artifact: { ...eaBase },
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
};
openProjectIntakeSession(meta, { goalLine: eaBase.goal_line });

const out = await runFounderDirectKernel({
  text: 'execute link',
  metadata: meta,
  route_label: 'dm_ai_router',
});
assert.notEqual(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_5_approval_lineage_crosscheck');
