/**
 * W8-C — 정적 가드:
 *  (1) 모든 writer 는 bindingWriterContract 에서 liveBindingWritersEnabled / assertNoSecretValueInWriterInput 를 사용한다.
 *  (2) live write 분기에 COS_LIVE_BINDING_WRITERS 라는 문자열이 직접/간접 검사로 존재한다.
 *  (3) writer 파일은 secret 값을 저장/로깅하는 반복 패턴을 포함하지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const WRITERS = [
  'src/founder/toolPlane/lanes/github/githubBindingWriter.js',
  'src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js',
  'src/founder/toolPlane/lanes/railway/railwayBindingWriter.js',
  'src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js',
];

for (const rel of WRITERS) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.ok(
    src.includes('liveBindingWritersEnabled'),
    `${rel}: must import liveBindingWritersEnabled`,
  );
  assert.ok(
    src.includes('assertNoSecretValueInWriterInput'),
    `${rel}: must assert no secret value`,
  );
  assert.ok(
    /buildSmokeResult|buildFailureResult|buildLiveResult/.test(src),
    `${rel}: must use common result builders`,
  );
  // no secret-logging anti-patterns
  assert.ok(!/console\.log\([^)]*token/i.test(src), `${rel}: no console.log of token`);
  assert.ok(!/console\.log\([^)]*secret/i.test(src), `${rel}: no console.log of secret`);
  // no raw secret-writing keys in request plumbing
  assert.ok(
    !/['"`]secret_value['"`]\s*:/.test(src),
    `${rel}: no secret_value: field in request plumbing`,
  );
}

// contract file itself defines the flag string
const contract = fs.readFileSync(
  path.join(ROOT, 'src/founder/toolPlane/lanes/bindingWriterContract.js'),
  'utf8',
);
assert.ok(contract.includes('COS_LIVE_BINDING_WRITERS'));
assert.ok(contract.includes('assertNoSecretValueInWriterInput'));

console.log('test-live-binding-writers-static-guard: ok');
