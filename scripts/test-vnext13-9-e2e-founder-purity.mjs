#!/usr/bin/env node
/**
 * vNext.13.9 — mock structured 응답이 Council/내부 헤더를 포함해도 최종 표면에서 제거.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runFounderDirectKernel } from '../src/founder/founderDirectKernel.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';
import { openProjectIntakeSession } from '../src/features/projectIntakeSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-purity-'));
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'founder-conv.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');

const meta = {
  source_type: 'direct_message',
  channel: 'Dpurity',
  user: 'Up',
  ts: '9.1',
  slack_route_label: 'dm_ai_router',
  failure_notes: ['파일을 읽지 못했습니다.'],
  mockFounderPlannerRow: {
    natural_language_reply:
      'strategy_finance: 예산\nrisk_review: 위험\n페르소나별 핵심 관점\n- a\n핵심 리스크: 큼\n내부 처리 정보: 비밀\n[COS 제안 패킷]\n짧게 정리합니다.',
    state_delta: {},
    conversation_status: 'exploring',
    proposal_artifact: {},
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: [],
    requires_founder_confirmation: false,
  },
};
openProjectIntakeSession(meta, { goalLine: 'purity e2e' });

const out = await runFounderDirectKernel({
  text: '첨부 봐줘',
  metadata: { ...meta, callText: async () => '', callJSON: null },
  route_label: 'dm_ai_router',
});

assert.equal(out.surface_type, FounderSurfaceType.PARTNER_NATURAL);
const t = String(out.text || '');
const banned = [
  'strategy_finance',
  'risk_review',
  '페르소나별 핵심 관점',
  '핵심 리스크',
  '내부 처리 정보',
  '[COS 제안 패킷]',
];
for (const b of banned) {
  assert.ok(!t.includes(b), `leaked: ${b}`);
}

console.log('ok: vnext13_9_e2e_founder_purity');
