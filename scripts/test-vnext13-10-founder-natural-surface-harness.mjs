#!/usr/bin/env node
/**
 * vNext.13.10 작업지시서 F1/F2 — 창업자 표면은 단일 자연어; directive D2 마커 0개.
 * (구조화 플래너 없음 — `runFounderDirectKernel` 단일 COS 턴만 검증.)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v1310-'));
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');

const BANNED = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장',
  '미해결 충돌',
  '핵심 리스크',
  '다음 행동',
  'strategy_finance',
  'risk_review',
];

function assertPlainSurface(text, label) {
  const t = String(text || '');
  for (const b of BANNED) {
    assert.ok(!t.includes(b), `${label}: banned fragment "${b}"`);
  }
}

openProjectIntakeSession(
  {
    source_type: 'direct_message',
    channel: 'Df1',
    user: 'U1',
    ts: '1.0',
    slack_route_label: 'dm_ai_router',
    failure_notes: ['파일 대신 HTML이 내려왔습니다.'],
    callText: async () =>
      '지금은 이미지 파일을 제대로 열어보지 못했어요. 다시 올려 주시거나, 화면에 보이는 내용을 짧게 글로 적어 주시면 그걸로 도와드릴게요.',
  },
  { goalLine: 'v1310 harness' },
);

const o1 = await runFounderDirectKernel({
  text: '이 이미지를 보고 어떤 내용인지 유추해서 3-5문장으로 서술해줘.',
  metadata: {
    source_type: 'direct_message',
    channel: 'Df1',
    user: 'U1',
    ts: '1.0',
    slack_route_label: 'dm_ai_router',
    failure_notes: ['파일 대신 HTML이 내려왔습니다.'],
    callText: async () =>
      '지금은 이미지 파일을 제대로 열어보지 못했어요. 다시 올려 주시거나, 화면에 보이는 내용을 짧게 글로 적어 주시면 그걸로 도와드릴게요.',
  },
  route_label: 'dm_ai_router',
});

assert.ok(o1.text.includes('열어보지 못했'), 'F1 stub surface');
assertPlainSurface(o1.text, 'F1');

openProjectIntakeSession(
  {
    source_type: 'direct_message',
    channel: 'Df2',
    user: 'U1',
    ts: '2.0',
    slack_route_label: 'dm_ai_router',
    failure_notes: ['수신 실패'],
    callText: async () =>
      '문서 본문을 여기서 열지는 못했어요. 파일을 다시 보내 주시거나 본문을 붙여 주시면 요약해 드릴게요.',
  },
  { goalLine: 'v1310 docx' },
);

const o2 = await runFounderDirectKernel({
  text: '이 문서를 읽고 (1) 3-5개 bullet point 요약, (2) 그 아래에 2-3문단으로 필요 내용 추출 요약 해줘.',
  metadata: {
    source_type: 'direct_message',
    channel: 'Df2',
    user: 'U1',
    ts: '2.0',
    slack_route_label: 'dm_ai_router',
    failure_notes: ['수신 실패'],
    callText: async () =>
      '문서 본문을 여기서 열지는 못했어요. 파일을 다시 보내 주시거나 본문을 붙여 주시면 요약해 드릴게요.',
  },
  route_label: 'dm_ai_router',
});

assert.ok(!o2.text.includes('"detail"'), 'F2 no raw JSON');
assertPlainSurface(o2.text, 'F2');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;

console.log('ok: vnext13_10_founder_natural_surface_harness');
