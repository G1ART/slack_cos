#!/usr/bin/env node
/**
 * W7-A regression #5 — no-new-slack-send-path guard.
 *
 * 헌법 §4 (Slack→registerFounderHandlers→handleFounderSlackTurn→runFounderDirectConversation→
 *  sendFounderResponse 단일 경로) 를 지키기 위해, proactiveSignals 모듈은 다음을 **하지 않는다**:
 *   - Slack 어댑터/앱 import
 *   - sendFounderResponse / Slack 웹훅 / WebClient 직접 호출
 *   - Supabase/tool lane 외부 호출 (pure rollup 이어야 함)
 *
 * 또한 read_execution_context(handleReadExecutionContext) 의 반환에 신호가 compact_lines 로만
 * 노출되고, 새로운 Slack 송신 경로가 생기지 않음을 정적 검사로 확인한다.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = 'src/founder/proactiveSignals.js';
const src = readFileSync(path.resolve(SRC), 'utf8');

// import 문 수집
const importLines = src.split(/\n/).filter((l) => /^\s*import\b/.test(l));

// Slack/transport 계열 import 금지
const FORBIDDEN_IMPORT_PATTERNS = [
  /@slack\//,
  /slackBolt/i,
  /slackEvent/i,
  /slackClient/i,
  /sendFounderResponse/,
  /founderResponseSender/,
  /WebClient/,
  /executionArtifactAppender/i,   // supabase writes
  /supabaseClient/i,
  /openaiClient/i,
  /fetchFn/i,
];
for (const l of importLines) {
  for (const p of FORBIDDEN_IMPORT_PATTERNS) {
    assert.ok(!p.test(l), `proactiveSignals must not import (${p}): ${l}`);
  }
}

// 정적 바디에 Slack 관련 호출이 없음도 추가 확인
const FORBIDDEN_BODY_PATTERNS = [
  /slack\.web\.WebClient/,
  /chat\.postMessage/,
  /sendFounderResponse\s*\(/,
  /registerFounderHandlers\s*\(/,
];
for (const p of FORBIDDEN_BODY_PATTERNS) {
  assert.ok(!p.test(src), `proactiveSignals body must not contain pattern ${p}`);
}

// handleReadExecutionContext 에서도 신호가 compact_lines 경로로만 노출되는지 static check
const handler = readFileSync(path.resolve('src/founder/founderCosToolHandlers.js'), 'utf8');
assert.ok(/proactive_signals_compact_lines/.test(handler), 'handler exposes proactive_signals_compact_lines');
assert.ok(!/proactiveSignals[\s\S]*sendFounderResponse/.test(handler), 'handler does not send Slack from signals');

console.log('test-proactive-signals-no-new-slack-send-path: ok');
