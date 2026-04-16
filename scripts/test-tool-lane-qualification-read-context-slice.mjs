#!/usr/bin/env node
/**
 * W7-B regression #6 — read_execution_context 가 tool_qualification_summary_lines 를
 * 새 응답 슬라이스로 노출하고, founderCosToolHandlers 정적 본문에 wiring 이 들어 있다.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const handler = readFileSync(path.resolve('src/founder/founderCosToolHandlers.js'), 'utf8');

// import + 호출 + slice 키
assert.ok(/buildToolQualificationSummaryLines/.test(handler), 'handler imports buildToolQualificationSummaryLines');
assert.ok(/tool_qualification_summary_lines/.test(handler), 'handler emits tool_qualification_summary_lines slice');

// Slack 송신 경로가 새로 추가되지 않음 — qualification 모듈은 send 함수를 부르지 않는다
const qual = readFileSync(path.resolve('src/founder/toolPlane/toolLaneQualification.js'), 'utf8');
const FORBIDDEN_TRANSPORT = [
  /sendFounderResponse\s*\(/,
  /chat\.postMessage/,
  /WebClient/,
  /registerFounderHandlers\s*\(/,
];
for (const p of FORBIDDEN_TRANSPORT) {
  assert.ok(!p.test(qual), `qualification module must not call ${p}`);
}

console.log('test-tool-lane-qualification-read-context-slice: ok');
