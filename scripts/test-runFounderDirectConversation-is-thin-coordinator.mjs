import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rf = fs.readFileSync(path.join(root, 'src/founder/runFounderDirectConversation.js'), 'utf8');

assert.ok(!rf.includes('export function buildSystemInstructions'), 'system instructions must not be defined here');
assert.ok(!rf.includes('export function buildFounderConversationInput'), 'conversation input must not be defined here');
assert.ok(!rf.includes('MAX_TOOL_ROUNDS'), 'tool loop constants must not live in coordinator');
assert.ok(!rf.includes('당신은 G1 COS다'), 'system instruction body must not be embedded in coordinator');
assert.ok(rf.includes("from './founderToolLoop.js'"), 'coordinator must delegate tool loop module');
assert.ok(rf.includes("from './founderSystemInstructions.js'"), 'coordinator must delegate system instructions module');

console.log('test-runFounderDirectConversation-is-thin-coordinator: ok');
