#!/usr/bin/env node
/** vNext.13.5 — COS_FOUNDER_STAGING_MODE=0 이면 trace founder_staging_mode false */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { isFounderStagingModeEnabled } from '../src/founder/founderArtifactGate.js';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';

const prev = process.env.COS_FOUNDER_STAGING_MODE;

delete process.env.COS_FOUNDER_STAGING_MODE;
assert.equal(isFounderStagingModeEnabled(), true);

process.env.COS_FOUNDER_STAGING_MODE = '0';
assert.equal(isFounderStagingModeEnabled(), false);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v135-staging-'));
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
  channel: 'Dstg',
  user: 'Ustg',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  mockFounderPlannerRow: {
    natural_language_reply: 'x',
    state_delta: {},
    conversation_status: 'exploring',
    proposal_artifact: {},
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
};

const on = await runFounderDirectKernel({
  text: '안녕',
  metadata: meta,
  route_label: 'dm_ai_router',
});
assert.equal(on.trace?.founder_staging_mode, false);

delete process.env.COS_FOUNDER_STAGING_MODE;
const offDefault = await runFounderDirectKernel({
  text: '안녕2',
  metadata: { ...meta, ts: '2.0' },
  route_label: 'dm_ai_router',
});
assert.equal(offDefault.trace?.founder_staging_mode, true);

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PROJECT_SPACES_FILE;

if (prev === undefined) delete process.env.COS_FOUNDER_STAGING_MODE;
else process.env.COS_FOUNDER_STAGING_MODE = prev;

console.log('ok: vnext13_5_founder_staging_mode_boundary');
