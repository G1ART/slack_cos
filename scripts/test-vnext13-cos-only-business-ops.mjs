#!/usr/bin/env node
/** vNext.13 — 예산/IR/문서 등 비개발 업무는 기본 COS_ONLY·INTERNAL_SUPPORT + 카탈로그 연결 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProposalFromFounderInput } from '../src/founder/founderProposalKernel.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { selectExecutionModeFromProposalPacket } from '../src/founder/executionModeFromProposalPacket.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { CAPABILITY_EXECUTION_CONTRACTS } from '../src/orchestration/cosCapabilityCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'orchestration', 'cosCapabilityCatalog.js'),
  'utf8',
);

const business = [
  'market_research',
  'strategy_memo',
  'document_write',
  'document_review',
  'budget_planning',
  'financial_scenario',
  'ir_deck',
  'investor_research',
  'outreach_copy',
];
for (const k of business) {
  assert.ok(CAPABILITY_EXECUTION_CONTRACTS[k], `catalog has ${k}`);
  const c = CAPABILITY_EXECUTION_CONTRACTS[k];
  assert.ok(
    c.allowed_providers?.includes('internal_artifact'),
    `${k} defaults internal_artifact`,
  );
  assert.ok(
    c.forbidden_actions?.includes('external_mutation'),
    `${k} forbids external_mutation`,
  );
  assert.ok(catSrc.includes(k), `source file mentions ${k}`);
}

const mk = (text, ch) => {
  const m = { source_type: 'direct_message', channel: ch, user: 'Ub', ts: '1' };
  return buildProposalFromFounderInput({
    rawText: text,
    contextFrame: synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m }),
  });
};

const modeBudget = selectExecutionModeFromProposalPacket(
  mk('이번 분기 예산 배분과 런웨이 시나리오', 'Dbud'),
);
assert.ok(['COS_ONLY', 'INTERNAL_SUPPORT'].includes(modeBudget), 'budget stays non-external');
const modeIr = selectExecutionModeFromProposalPacket(
  mk('IR 덱 슬라이드 순서와 메시지 톤만 다듬어줘', 'Dir'),
);
assert.ok(['COS_ONLY', 'INTERNAL_SUPPORT'].includes(modeIr), 'IR stays non-external');
assert.equal(
  selectExecutionModeFromProposalPacket(mk('경쟁사 3곳 벤치마크 표로 정리', 'Dmr')),
  'INTERNAL_SUPPORT',
);

console.log('ok: vnext13_cos_only_business_ops');
