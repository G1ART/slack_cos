#!/usr/bin/env node
/**
 * 창업자 direct chat: SHA / Cursor·Supabase 브리지 질문이 LLM·Council로 가지 않고
 * 런타임 메타·providerTruth로 결정론 응답하는지 고정한다.
 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-fop-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const {
  classifyFounderOperationalProbe,
  looksLikeRuntimeShaQuery,
  classifyFounderRoutingLock,
} = await import('../src/features/inboundFounderRoutingLock.js');
const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');

assert.equal(classifyFounderOperationalProbe('현재 SHA 버전이 뭔지 출력해줘.')?.kind, 'runtime_sha');
assert.equal(classifyFounderOperationalProbe('Cursor 상태는 어때?')?.kind, 'provider_cursor');
assert.equal(
  classifyFounderOperationalProbe('Supabase 연결 상태는 어때?')?.kind,
  'provider_supabase',
);
assert.ok(!classifyFounderOperationalProbe('Cursor 시장 점유율은?'), 'no integration keywords');
assert.ok(looksLikeRuntimeShaQuery('HEAD sha 알려줘'));
assert.equal(classifyFounderRoutingLock('현재 SHA 뭐야')?.kind, 'version');

let llmCalled = 0;
const outSha = await founderRequestPipeline({
  text: '현재 SHA 버전이 뭔지 출력해줘.',
  metadata: {
    source_type: 'direct_message',
    channel: 'DTEST',
    user: 'U_H',
    ts: '1',
    callText: async () => {
      llmCalled += 1;
      return 'should not run';
    },
  },
  route_label: 'dm_ai_router',
});
assert.equal(llmCalled, 0, 'LLM must not run for SHA probe');
assert.ok(outSha?.text?.includes('sha:'), outSha?.text);
assert.equal(outSha.trace.founder_operational_probe, 'runtime_sha');

const outCur = await founderRequestPipeline({
  text: 'Cursor 상태는 어때?',
  metadata: {
    source_type: 'direct_message',
    channel: 'DTEST',
    user: 'U_H',
    ts: '2',
    callText: async () => {
      llmCalled += 1;
      return 'council spam';
    },
  },
  route_label: 'dm_ai_router',
});
assert.ok(outCur?.text?.includes('Cursor Cloud 브리지'), outCur?.text);
assert.ok(outCur?.text?.includes('COS 판정:'), outCur?.text);
assert.equal(outCur.trace.founder_operational_probe, 'provider_cursor');

const outSb = await founderRequestPipeline({
  text: 'Supabase 연결 상태는 어때?',
  metadata: {
    source_type: 'direct_message',
    channel: 'DTEST',
    user: 'U_H',
    ts: '3',
    callText: async () => {
      llmCalled += 1;
      return 'council spam';
    },
  },
  route_label: 'dm_ai_router',
});
assert.ok(outSb?.text?.includes('Supabase'), outSb?.text);
assert.equal(outSb.trace.founder_operational_probe, 'provider_supabase');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: founder_operational_probe');
