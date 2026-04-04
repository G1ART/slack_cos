#!/usr/bin/env node
/** vNext.13.4+13.5 — execution_artifact + lineage cross-check 통과 시에만 launch */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v134-agl-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'runs.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const goal = '아티팩트 게이트 전용 목표';
const pid = 'agl-prop-1';
const aid = 'agl-appr-1';
const meta = {
  source_type: 'direct_message',
  channel: 'Dagl1',
  user: 'Uagl',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: {
    natural_language_reply: '',
    state_delta: {
      latest_proposal_artifact_id: pid,
      latest_approval_artifact_id: aid,
      last_founder_confirmation_at: '2026-04-02T10:00:00.000Z',
      last_founder_confirmation_kind: 'test',
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
      locked_scope_summary: '게이트 테스트 스코프',
    },
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
};
openProjectIntakeSession(meta, { goalLine: goal });

const out = await runFounderDirectKernel({
  text: '실행 연결해줘',
  metadata: meta,
  route_label: 'dm_ai_router',
});

assert.equal(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);
assert.equal(out.trace.founder_artifact_gated_launch, true);
assert.equal(out.trace.founder_step, 'artifact_gated_launch');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_4_founder_artifact_gated_launch');
