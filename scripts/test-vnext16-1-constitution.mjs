import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractForbiddenPhrasesFromConstitution,
  findForbiddenSubstring,
} from '../src/founder/constitutionExtract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const conPath = path.join(root, 'CONSTITUTION.md');

assert.ok(fs.existsSync(conPath), 'CONSTITUTION.md must exist at repo root');
const md = fs.readFileSync(conPath, 'utf8');
assert.ok(md.includes('## 4.3 founder 경로에서 금지되는 것'), 'constitution must contain §4.3 heading');

const forbidden = extractForbiddenPhrasesFromConstitution(md);
assert.ok(forbidden.length >= 5, 'expected non-empty forbidden list from §4.3');
assert.ok(forbidden.includes('한 줄 요약'), 'sample forbidden phrase missing');

const hit = findForbiddenSubstring('여기 한 줄 요약을 적었습니다.', forbidden);
assert.equal(hit, '한 줄 요약');

console.log('test-vnext16-1-constitution: ok');
