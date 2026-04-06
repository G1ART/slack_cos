#!/usr/bin/env node
/** vNext.13.8 / vNext.13.10 — 기본 경로에서 모델 전 접두 제거(내용 해석) 없음; 단일 COS 턴 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'founder', 'founderDirectKernel.js'), 'utf8');

assert.ok(!src.includes('stripFounderStructuredCommandPrefixes'));
assert.ok(
  src.includes('return runFounderNaturalChatOnly(normalized,'),
  'natural chat path receives normalized text without extra stripping',
);

console.log('ok: vnext13_8_founder_default_path_no_preclassifier');
