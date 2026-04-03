#!/usr/bin/env node
/** vNext.12 — 창업자 경로: command router 무관 + 금지어 + trace 불변식 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const BANNED = [
  '업무등록',
  '계획등록',
  '협의모드',
  '페르소나',
  '참여 페르소나',
  'responder',
  'council',
  'structured command',
  'planner mode',
  'command router',
];

function assertClean(text, label) {
  const low = String(text || '').toLowerCase();
  for (const w of BANNED) {
    assert.ok(!low.includes(w.toLowerCase()), `${label}: banned "${w}"`);
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v12f-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'q.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'p.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');
const { openProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');

async function dm(text, callText) {
  const meta = {
    source_type: 'direct_message',
    channel: 'Dv12',
    user: 'Uv12',
    ts: String(Math.random()),
    slack_route_label: 'dm_ai_router',
    callText,
  };
  openProjectIntakeSession(meta, { goalLine: 'v12 founder zero-command' });
  return founderRequestPipeline({ text, metadata: meta, route_label: 'dm_ai_router' });
}

const probes = [
  '현재 SHA 버전이 뭔지 출력해줘.',
  'Cursor 상태는 어때?',
  'Supabase 연결 상태는 어때?',
  '지금 어디까지 왔어?',
  '왜 아직도 handoff로 빠져?',
];

for (const p of probes) {
  const out = await dm(p, async () => 'NO_LLM');
  assert.equal(out.trace.legacy_command_router_used, false, p);
  assert.equal(out.trace.founder_four_step, true, p);
  assertClean(out.text, p);
}

const vague = await dm('그냥 궁금한데요.', async () => '어떤 맥락인지 한 줄만 더 알려주세요.');
assert.equal(vague.trace.legacy_command_router_used, false);
assertClean(vague.text, 'vague');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext12_founder_zero_command');
