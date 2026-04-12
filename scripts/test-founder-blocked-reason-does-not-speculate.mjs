/**
 * vNext.13.79 — No founder-facing tool-block formatter; blocked/policy lines are not synthesized into Slack same-turn text.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rf = fs.readFileSync(path.join(__dirname, '..', 'src/founder/runFounderDirectConversation.js'), 'utf8');
assert.ok(!rf.includes('formatFounderSafeToolBlockMessage'));

console.log('test-founder-blocked-reason-does-not-speculate: ok');
