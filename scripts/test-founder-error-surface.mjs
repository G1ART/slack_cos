import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const regPath = path.join(__dirname, '../src/founder/registerFounderHandlers.js');
const reg = fs.readFileSync(regPath, 'utf8');

assert.ok(!reg.includes('formatErr'), 'no internal error formatter in handler');
assert.ok(!reg.includes('e?.code'), 'no error code leak to user text');
assert.ok(!reg.includes('e?.message'), 'no raw exception message to user');
assert.ok(reg.includes('FOUNDER_ERROR_USER_TEXT'), 'fixed user-facing error constant');
assert.ok(
  reg.includes('죄송합니다. 방금 응답을 보내는 중 문제가 생겼습니다.'),
  'fixed Korean error copy',
);

console.log('test-founder-error-surface: ok');
