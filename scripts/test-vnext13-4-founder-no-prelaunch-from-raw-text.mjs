#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v134-npl-'));
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
  channel: 'Dnpl1',
  user: 'Unpl',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: {
    natural_language_reply: 'Need scope line before execution artifact.',
    state_delta: {},
    conversation_status: 'narrowing',
    proposal_artifact: { understood_request: 'progress intent', cos_only_tasks: ['clarify scope'] },
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: ['What is the minimum scope for this run?'],
    requires_founder_confirmation: true,
  },
  callText: async () => {
    throw new Error('LLM must not run');
  },
};
openProjectIntakeSession(meta, { goalLine: 'no-prelaunch raw only' });

const out = await runFounderDirectKernel({
  text: 'OK proceed.',
  metadata: meta,
  route_label: 'dm_ai_router',
});

assert.notEqual(out.surface_type, FounderSurfaceType.EXECUTION_PACKET);
assert.equal(out.trace.founder_conversation_path, true);
assert.ok(out.text.includes('[COS 제안 패킷]'));

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext13_4_founder_no_prelaunch_from_raw_text');
