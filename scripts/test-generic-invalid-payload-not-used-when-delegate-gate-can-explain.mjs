/**
 * vNext.13.79 — Founder same-turn Slack text is acknowledgement-only; no safe-tool-block translation path.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { FOUNDER_SAME_TURN_ACK_TEXT } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rf = fs.readFileSync(path.join(__dirname, '..', 'src/founder/runFounderDirectConversation.js'), 'utf8');
assert.ok(!rf.includes('formatFounderSafeToolBlockMessage'));
assert.ok(!rf.includes('shouldReplaceFounderTextWithSafeToolBlockMessage'));
assert.ok(rf.includes('FOUNDER_SAME_TURN_ACK_TEXT'));
assert.equal(typeof FOUNDER_SAME_TURN_ACK_TEXT, 'string');
assert.ok(FOUNDER_SAME_TURN_ACK_TEXT.length > 0);

console.log('test-generic-invalid-payload-not-used-when-delegate-gate-can-explain: ok');
