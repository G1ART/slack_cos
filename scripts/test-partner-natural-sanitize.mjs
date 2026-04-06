#!/usr/bin/env node
/** PARTNER_NATURAL 경로: LLM이 Council 포맷을 내도 sanitize 후 위원회 헤더가 남지 않게 고정 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-pns-'));
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

const { runFounderDirectKernel } = await import('../src/founder/founderDirectKernel.js');
const { openProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');

const councilSpam = [
  '한 줄 요약',
  '테스트입니다.',
  '',
  '종합 추천안',
  '추천 본문',
  '',
  '페르소나별 핵심 관점',
  '- strategy_finance: 시장 이야기 / 권고: 관찰',
  '**ops_grants**: 운영 부담을 먼저 본다',
  '',
  '내부 처리 정보',
  '- 협의 모드: council',
].join('\n');

const meta = {
  source_type: 'direct_message',
  channel: 'Dsanitize1',
  user: 'Usan',
  ts: '400.0',
  slack_route_label: 'dm_ai_router',
  callText: async () => councilSpam,
};
openProjectIntakeSession(meta, { goalLine: 'sanitize 회귀 전용 한 줄 목표' });

const out = await runFounderDirectKernel({
  text: '그냥 잡담 한 줄.',
  metadata: meta,
  route_label: 'dm_ai_router',
});

assert.equal(out.surface_type, 'partner_natural_surface');
assert.ok(!out.text.includes('[COS 제안 패킷]'), 'vNext.13.7: no proposal packet on default founder path');
assert.equal(out.trace.partner_output_sanitized, true);
assert.ok(!out.text.includes('한 줄 요약'), out.text.slice(0, 400));
assert.ok(!out.text.includes('페르소나별'), out.text);
assert.ok(!out.text.includes('strategy_finance:'), out.text);
assert.ok(!out.text.includes('협의 모드'), out.text);

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: partner_natural_sanitize');
