import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseForbiddenPhrasesFromConstitution } from './lib/forbiddenConstitutionTest.mjs';
import { buildSystemInstructions } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'CONSTITUTION.md');
const md = fs.readFileSync(p, 'utf8');
const hash = crypto.createHash('sha256').update(md, 'utf8').digest('hex');

assert.ok(hash.length === 64, 'sha256 hex length');
const phrases = parseForbiddenPhrasesFromConstitution(md);
assert.ok(phrases.includes('한 줄 요약'), 'forbidden list parsed');
assert.ok(phrases.includes('strategy_finance'), 'tool persona tokens in list');

const instr = buildSystemInstructions(md);
assert.ok(instr.includes('--- 헌법 시작 ---'), 'instruction wraps constitution');
assert.ok(instr.includes('Founder'), 'instruction embeds identity');

console.log('test-constitution-loading: ok');
console.log('constitution_sha256:', hash);
