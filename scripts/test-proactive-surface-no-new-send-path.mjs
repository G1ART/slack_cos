#!/usr/bin/env node
/**
 * W10-A regression — proactive surface 모듈이 **새 Slack 송신 경로**를 만들지 않는다.
 *
 * 정적 가드(헌법 §4):
 *   - proactiveSurfacePolicy / proactiveSurfaceDraft 에서 `client.chat.postMessage`,
 *     `WebClient` 직접 인스턴스화, 새 `send*Response` 헬퍼 정의, fetch/axios/https 등
 *     외부 호출이 있으면 실패시킨다.
 *   - 두 모듈 다 sendFounderResponse 를 import 하지 않는다 (상위 spine 만 담당).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  path.resolve(here, '..', 'src/founder/proactiveSurfacePolicy.js'),
  path.resolve(here, '..', 'src/founder/proactiveSurfaceDraft.js'),
];

const FORBIDDEN_PATTERNS = [
  /chat\.postMessage/,
  /new\s+WebClient\b/,
  /require\(['"]@slack\/bolt['"]\)/,
  /from\s+['"]@slack\/bolt['"]/,
  /import\s+[^'"\n]*\s+from\s+['"]@slack\/web-api['"]/,
  /\bfetch\s*\(/,
  /\brequire\(['"]axios['"]\)/,
  /\brequire\(['"]https?['"]\)/,
  /\bimport\s+[^'"\n]*\s+from\s+['"]node:https?['"]/,
  /function\s+send[A-Z][A-Za-z0-9]*Response\b/,
];

function stripCommentsAndStrings(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/^\s*\/\/.*$/gm, '');
  out = out.replace(/^\s*\*.*$/gm, '');
  return out;
}

for (const p of TARGETS) {
  const raw = fs.readFileSync(p, 'utf8');
  const src = stripCommentsAndStrings(raw);
  for (const re of FORBIDDEN_PATTERNS) {
    assert.ok(
      !re.test(src),
      `${path.basename(p)}: forbidden pattern ${re} (new send path / external I/O) must not appear in executable code`,
    );
  }
  // sendFounderResponse 는 import/함수 호출로는 등장하면 안 된다(주석 허용).
  assert.ok(
    !/import\s+[^'"\n]*sendFounderResponse|sendFounderResponse\s*\(/.test(src),
    `${path.basename(p)}: must not import or call sendFounderResponse`,
  );
  // Pure function hint: 외부 store/Supabase direct import 도 금지
  assert.ok(!/from\s+['"]\.\.\/..\/..?\/.*supabase/i.test(src), 'no supabase import in policy/draft');
  assert.ok(!/executionRunStore|runStoreSupabase/.test(src), 'no run store import in policy/draft');
}

// 또한 founderConversationInput 가 새로 Slack 호출을 넣지 않았음을 확인
const convPath = path.resolve(here, '..', 'src/founder/founderConversationInput.js');
const convSrc = stripCommentsAndStrings(fs.readFileSync(convPath, 'utf8'));
assert.ok(!/chat\.postMessage|new\s+WebClient|sendFounderResponse\s*\(/.test(convSrc), 'conversation input remains pure');

console.log('test-proactive-surface-no-new-send-path: ok');
