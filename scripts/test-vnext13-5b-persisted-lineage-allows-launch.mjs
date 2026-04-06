#!/usr/bin/env node
/** vNext.13.5b — 1턴에서 durable lineage 저장 후 2턴에서 execution 만 요청 시 launch 허용 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { runFounderArtifactConversationPipeline } from '../src/founder/founderDirectKernel.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v135b-two-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'runs.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const pid = 'two-p-1';
const aid = 'two-a-1';
const goal = 'two turn lineage goal';
const baseMeta = {
  source_type: 'direct_message',
  channel: 'DtwoTurn',
  user: 'U2t',
  slack_route_label: 'dm_ai_router',
};
openProjectIntakeSession({ ...baseMeta, ts: '0.0' }, { goalLine: goal });

const tkTwo = buildSlackThreadKey({ ...baseMeta, ts: '1.0' });
const turn1 = await runFounderArtifactConversationPipeline(
  '승인 확정 반영',
  {
    ...baseMeta,
    ts: '1.0',
    mockFounderPlannerRow: {
      natural_language_reply: 'lineage 저장',
      state_delta: {
        latest_proposal_artifact_id: pid,
        latest_approval_artifact_id: aid,
        last_founder_confirmation_at: '2026-04-05T11:00:00.000Z',
        last_founder_confirmation_kind: 'founder_turn1',
        approval_lineage_status: 'confirmed',
      },
      conversation_status: 'execution_ready',
      proposal_artifact: { _cos_artifact_id: pid },
      approval_artifact: { _cos_artifact_id: aid },
      execution_artifact: {},
      follow_up_questions: [],
      requires_founder_confirmation: false,
    },
  },
  'dm_ai_router',
  tkTwo,
  null,
  null,
);
assert.notEqual(turn1.surface_type, FounderSurfaceType.EXECUTION_PACKET);

const turn2 = await runFounderArtifactConversationPipeline(
  '실행 스파인 연결',
  {
    ...baseMeta,
    ts: '2.0',
    mockFounderPlannerRow: {
      natural_language_reply: '',
      state_delta: {},
      conversation_status: 'execution_ready',
      proposal_artifact: {},
      approval_artifact: {},
      execution_artifact: {
        request_execution_spine: true,
        source_proposal_artifact_id: pid,
        source_approval_artifact_id: aid,
        goal_line: goal,
        locked_scope_summary: 'two-turn scope',
      },
      follow_up_questions: [],
      requires_founder_confirmation: false,
    },
  },
  'dm_ai_router',
  tkTwo,
  null,
  null,
);

assert.equal(turn2.surface_type, FounderSurfaceType.EXECUTION_PACKET);
assert.equal(turn2.trace.founder_artifact_gated_launch, true);
assert.equal(turn2.trace.founder_spine_eligibility_source, 'persisted_pre_turn_lineage');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_5b_persisted_lineage_allows_launch');
