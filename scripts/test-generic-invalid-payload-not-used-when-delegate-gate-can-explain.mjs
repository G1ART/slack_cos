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
assert.ok(/text:\s*finalText,\s*starter_ack:\s*finalText/.test(rf), 'starter_ack mirrors the Slack-ready text (W4 surface layer keeps them identical)');

console.log('test-generic-invalid-payload-not-used-when-delegate-gate-can-explain: ok');
