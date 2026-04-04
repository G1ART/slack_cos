#!/usr/bin/env node
/**
 * vNext.13.2 — Founder-facing dress rehearsal (no live Slack).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';
import {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
  getExecutionRunById,
} from '../src/features/executionRun.js';
import { ensureExecutionRunDispatched } from '../src/features/executionDispatchLifecycle.js';
import {
  holdExternalExecutionForRun,
  authorizeExternalExecutionForRun,
  isExternalMutationAuthorized,
} from '../src/orchestration/approvalGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const e2eTmp = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'g1cos-e2e-dress-'));
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(e2eTmp, 'founder-conv.json');
await fsPromises.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');

async function dm(channel, text, callText) {
  const meta = {
    source_type: 'direct_message',
    channel,
    user: 'Ue2e',
    ts: `${channel}.1`,
    slack_route_label: 'dm_ai_router',
    callText,
  };
  if (channel === 'De2eex') {
    meta.mockFounderPlannerRow = {
      natural_language_reply: '외부 실행은 승인 패킷으로 정리합니다.',
      state_delta: {},
      conversation_status: 'approval_pending',
      proposal_artifact: {},
      approval_artifact: {
        requires_external_dispatch: true,
        external_tasks: ['GitHub/Cursor/Supabase MVP 실행'],
        rationale: 'E2E dress 외부 실행 후보',
      },
      execution_artifact: {},
      follow_up_questions: [],
      requires_founder_confirmation: true,
    };
  } else {
    meta.mockFounderPlannerRow = {
      natural_language_reply: '',
      state_delta: {},
      conversation_status: 'exploring',
      proposal_artifact: {
        understood_request: text.slice(0, 200),
        cos_only_tasks: ['스레드 맥락 정리'],
      },
      approval_artifact: {},
      execution_artifact: {},
      follow_up_questions: [],
      requires_founder_confirmation: false,
    };
  }
  openProjectIntakeSession(meta, { goalLine: `E2E dress ${channel}` });
  return runFounderDirectKernel({ text, metadata: meta, route_label: 'dm_ai_router' });
}

/* E1 IR deck */
const o1 = await dm(
  'De2eir',
  'IR deck narrative 다시 짜줘. 미국 VC / 전략적 투자자 / 아트섹터 투자자별로 톤도 나눠.',
  async () => '',
);
assert.equal(o1.surface_type, FounderSurfaceType.PROPOSAL_PACKET);
assert.ok(o1.text.includes('[COS 제안 패킷]'));
assert.ok(!o1.text.includes('*외부 실행 승인 요약'));

/* E2 competitor */
const o2 = await dm('De2eco', '경쟁사 5곳 벤치마킹해서 차별화 전략 메모로 정리해줘.', async () => '');
assert.equal(o2.surface_type, FounderSurfaceType.PROPOSAL_PACKET);

/* E3 budget */
const o3 = await dm('De2ebud', '이번 분기 예산 시나리오 3개 짜줘. 공격/중립/보수.', async () => '');
assert.ok(
  o3.surface_type === FounderSurfaceType.PROPOSAL_PACKET ||
    (o3.text.includes('[COS 제안 패킷]') && !o3.text.includes('*외부 실행 승인 요약')),
);

/* E4 external build → approval packet */
const o4 = await dm(
  'De2eex',
  '좋아, 이제 이 앱 MVP를 GitHub/Cursor/Supabase까지 실제로 실행해.',
  async () => {
    throw new Error('no partner on external path');
  },
);
assert.equal(o4.surface_type, FounderSurfaceType.APPROVAL_PACKET);
assert.ok(o4.text.includes('외부 실행 승인'));

const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g1cos-e2e-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'runs.json');
await fs.promises.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:e2e:1',
  goal_line: 'e2e',
  locked_scope_summary: 'x',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'Ue2e',
});
const run = createExecutionRun({ packet, metadata: {} });
assert.equal(isExternalMutationAuthorized(run), false);
ensureExecutionRunDispatched(run, {});
assert.equal(getExecutionRunById(run.run_id).outbound_dispatch_state, 'not_started');
authorizeExternalExecutionForRun(run.run_id, { reason: 'e2e' });
assert.equal(isExternalMutationAuthorized(getExecutionRunById(run.run_id)), true);

clearExecutionRunsForTest();
const packet2 = createExecutionPacket({
  thread_key: 'ch:e2e:2',
  goal_line: 'e2e2',
  locked_scope_summary: 'x',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'Ue2e',
});
const run2 = createExecutionRun({ packet: packet2, metadata: {} });
holdExternalExecutionForRun(run2.run_id, { reason: '보류' });
assert.equal(isExternalMutationAuthorized(getExecutionRunById(run2.run_id)), false);
ensureExecutionRunDispatched(getExecutionRunById(run2.run_id), {});
assert.equal(getExecutionRunById(run2.run_id).outbound_dispatch_state, 'not_started');

await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.EXECUTION_RUNS_FILE;

/* E6 governance advisory — vNext.13.3: 제안 패킷 서피스에서는 부록 비활성(기본·금지 서피스) */
const o6 = await dm(
  'De2egov',
  '이제 투자자별 맞춤 아웃리치까지 자동화하고 싶은데, 지금 구조로 충분한가?',
  async () => '',
);
assert.equal(o6.surface_type, FounderSurfaceType.PROPOSAL_PACKET);
assert.equal(o6.trace.cos_governance_advisory, false);
assert.ok(!o6.text.includes('COS 운영 조언'));

await fsPromises.rm(e2eTmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;

console.log('ok: vnext13_2_slack_e2e_dress_rehearsal');
