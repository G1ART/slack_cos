import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendFounderResponse } from '../src/founder/sendFounderResponse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const sendSrc = fs.readFileSync(path.join(root, 'src/founder/sendFounderResponse.js'), 'utf8');
const deny = [
  'findForbiddenInText',
  'parseForbiddenPhrasesFromConstitution',
  'normalizeTextForForbiddenScan',
  'compactForForbiddenScan',
  'forbiddenPhrases',
  'skipForbiddenCheck',
  'founder_forbidden_substring',
];
for (const needle of deny) {
  assert.ok(!sendSrc.includes(needle), `sendFounderResponse must not contain ${needle}`);
}

const convSrc = fs.readFileSync(path.join(root, 'src/founder/runFounderDirectConversation.js'), 'utf8');
assert.ok(!convSrc.includes('scope_not_locked'), 'no scope maturity policing');
assert.ok(!convSrc.includes('evaluateToolExecutionBoundary'), 'renamed validator');
assert.ok(!convSrc.includes('hadAssistant'), 'no assistant-turn gate');

const regSrc = fs.readFileSync(path.join(root, 'src/founder/registerFounderHandlers.js'), 'utf8');
assert.ok(!regSrc.includes('forbiddenPhrases'), 'handlers do not wire forbidden list');
assert.ok(!regSrc.includes('parseForbiddenPhrasesFromConstitution'), 'no runtime parse');

let outbound = '';
await sendFounderResponse({
  say: async (p) => {
    outbound = typeof p === 'string' ? p : p?.text;
  },
  text: 'council synthesis and 한 줄 요약 in one line',
  constitutionSha256: 'abc',
});
assert.ok(outbound.includes('council'), 'pass-through content');

console.log('test-direct-conversation-pass_through_runtime: ok');
