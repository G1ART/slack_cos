/**
 * vNext.13.79+ — Founder Slack 본문은 모델 text; 별도 safe-tool-block 치환 경로 없음.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rf = fs.readFileSync(path.join(__dirname, '..', 'src/founder/runFounderDirectConversation.js'), 'utf8');
assert.ok(!rf.includes('formatFounderSafeToolBlockMessage'));
assert.ok(!rf.includes('shouldReplaceFounderTextWithSafeToolBlockMessage'));
assert.ok(rf.includes('return { text, starter_ack: text }'), 'starter_ack mirrors model text for Slack');

console.log('test-generic-invalid-payload-not-used-when-delegate-gate-can-explain: ok');
