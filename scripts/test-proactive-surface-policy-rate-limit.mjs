#!/usr/bin/env node
/**
 * W10-A regression — rate-limit: 최근 assistant 턴에 같은 kind 가 언급됐다면 지정 분 내엔 suppress.
 */

import assert from 'node:assert/strict';

import { applyProactiveSurfacePolicy } from '../src/founder/proactiveSurfacePolicy.js';

const signals = [
  { kind: 'stale_run', severity: 'attention', summary_line: '실행이 60분째 멈춰 있음 (status=running)' },
];

const now = '2026-04-16T22:30:00Z';
const recent = '2026-04-16T22:20:00Z'; // 10분 전 surface

// 최근 assistant 턴에 stale_run 관련 문구("멈춰"·"진행 신호") 가 있으면 suppress
const recentTurns = [
  { role: 'user', text: '상황 알려줘' },
  { role: 'assistant', text: '현재 실행이 45분째 진행 신호 없이 멈춰 있습니다.' },
];

const out1 = applyProactiveSurfacePolicy({
  signals,
  recent_turns: recentTurns,
  now_iso: now,
  last_surfaced_at_iso: recent,
  rate_limit_minutes: 30,
});
assert.equal(out1.selected_signals.length, 0, 'rate-limited within 30min');
const reasons1 = out1.suppressed_signals.map((s) => s.reason);
assert.ok(reasons1.includes('rate_limited_recent_surface'));

// 같은 신호라도 recent_turns 에 관련 문구가 없으면 통과
const recentTurns2 = [
  { role: 'user', text: '상황 알려줘' },
  { role: 'assistant', text: '준비 중입니다.' },
];
const out2 = applyProactiveSurfacePolicy({
  signals,
  recent_turns: recentTurns2,
  now_iso: now,
  last_surfaced_at_iso: recent,
  rate_limit_minutes: 30,
});
assert.equal(out2.selected_signals.length, 1, 'not rate-limited when last assistant text has no kind phrase');

// rate_limit_minutes=0 은 기본(30)으로 fallback → recentTurns 상관없이 억제되지 않음 (last_surfaced_at_iso=null)
const out3 = applyProactiveSurfacePolicy({
  signals,
  recent_turns: recentTurns,
  now_iso: now,
  last_surfaced_at_iso: null,
});
assert.equal(out3.selected_signals.length, 1, 'null last_surfaced_at_iso bypasses rate-limit');

console.log('test-proactive-surface-policy-rate-limit: ok');
