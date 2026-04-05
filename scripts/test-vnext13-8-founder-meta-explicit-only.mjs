#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v138-meta-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'founder-conv.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const { runFounderDirectKernel } = await import('../src/founder/founderDirectKernel.js');

let calls = 0;
const metaBase = {
  source_type: 'direct_message',
  channel: 'Dm138',
  user: 'U1',
  ts: '1',
  callText: async () => {
    calls += 1;
    return 'LLM 자연어 응답';
  },
};

const implicit = await runFounderDirectKernel({
  text: '현재 SHA 버전이 뭔지 출력해줘.',
  metadata: { ...metaBase, ts: '2' },
  route_label: 'dm_ai_router',
});
assert.ok(calls >= 1, 'SHA 질문은 explicit 플래그 없으면 유틸 단락 없이 모델 경로');
assert.ok(implicit.text.includes('LLM') || implicit.text.length > 0);

calls = 0;
const explicit = await runFounderDirectKernel({
  text: '현재 SHA 버전이 뭔지 출력해줘.',
  metadata: { ...metaBase, ts: '3', founder_explicit_meta_utility_path: true },
  route_label: 'dm_ai_router',
});
assert.equal(calls, 0, 'explicit meta 경로에서는 LLM 미호출');
assert.ok(explicit.trace?.founder_operational_meta_short_circuit === true || explicit.text.includes('SHA'));

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;

console.log('ok: vnext13_8_founder_meta_explicit_only');
