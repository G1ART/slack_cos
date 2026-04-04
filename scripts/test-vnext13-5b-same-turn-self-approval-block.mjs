#!/usr/bin/env node
/** vNext.13.5b — same-turn sidecar cannot self-authorize spine (full lineage + execution in one row) */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v135b-block-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'runs.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const pid = 'st-prop-1';
const aid = 'st-appr-1';
const goal = 'same-turn self auth block goal';

const meta = {
  source_type: 'direct_message',
  channel: 'DstBlock',
  user: 'Ustb',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: {
    natural_language_reply: 'filled in one planner row',
    state_delta: {
      latest_proposal_artifact_id: pid,
      latest_approval_artifact_id: aid,
      last_founder_confirmation_at: '2026-04-05T10:00:00.000Z',
      last_founder_confirmation_kind: 'llm_same_turn',
      approval_lineage_status: 'confirmed',
    },
    conversation_status: 'execution_ready',
    proposal_artifact: { _cos_artifact_id: pid },
    approval_artifact: { _cos_artifact_id: aid },
    execution_artifact: {
      request_execution_spine: true,
      source_proposal_artifact_id: pid,
      source_approval_artifact_id: aid,
      goal_line: goal,
      locked_scope_summary: 'same-turn scope',
      approval_lineage_confirmed: true,
    },
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
};
openProjectIntakeSession(meta, { goalLine: goal });

const out = await runFounderDirectKernel({
  text: 'connect execution now',
  metadata: meta,
  route_label: 'dm_ai_router',
});

assert.notEqual(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);
assert.equal(out.trace.founder_spine_eligibility_failed, true);
assert.equal(out.trace.founder_spine_eligibility_reason, 'same_turn_lineage_not_eligible');
assert.equal(out.trace.conversation_status, 'execution_ready');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_5b_same_turn_self_approval_block');
