#!/usr/bin/env node
/**
 * vNext.13.9+ — partner sanitize 가 Council 꼬리를 걷는지 (슬랙 표면은 13.10부터 planner NL 비사용).
 */
import assert from 'node:assert/strict';
import { sanitizePartnerNaturalLlmOutput } from '../src/features/founderSurfaceGuard.js';

const dirty =
  '페르소나별 핵심 관점\n- 전략\nstrategy_finance: 할일\n핵심 리스크: 큼\n짧게 답합니다.';

const { text: reply } = sanitizePartnerNaturalLlmOutput(dirty);
assert.ok(!reply.includes('페르소나별 핵심 관점'));
assert.ok(!reply.includes('strategy_finance'));
assert.ok(!reply.includes('핵심 리스크'));

console.log('ok: vnext13_9_structured_reply_sanitize');
