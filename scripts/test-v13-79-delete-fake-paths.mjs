/**
 * vNext.13.79 — Grep/assert: fake policy paths removed; canonical cursor path is intake-only.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const tb = read('src/founder/toolsBridge.js');
assert.ok(!tb.includes('CREATE_SPEC_DISALLOWED_IN_LIVE_ONLY_MODE'));
assert.ok(!tb.includes('create_spec_disallowed_in_live_only_mode'));

const rf = read('src/founder/runFounderDirectConversation.js');
assert.ok(!rf.includes('formatFounderSafeToolBlockMessage'));
assert.ok(!rf.includes('shouldReplaceFounderTextWithSafeToolBlockMessage'));

const reg = read('src/founder/registerFounderHandlers.js');
assert.ok(!reg.includes('text: out.answer'));

const h = read('src/founder/handleFounderSlackTurn.js');
assert.ok(!h.includes('answer: out.text'));

const canon = read('src/founder/canonicalExternalEvent.js');
assert.ok(!canon.includes('tryApplyAuthoritativeCursorEmitPatchClosureForRun'));
// Legacy `applyExternalCursorPacketProgressForRun` may remain exported for tests/adapters; processCanonical must not await it.
const procStart = canon.indexOf('export async function processCanonicalExternalEvent');
const procSlice = procStart >= 0 ? canon.slice(procStart) : canon;
assert.ok(!procSlice.includes('await applyExternalCursorPacketProgressForRun('));

console.log('test-v13-79-delete-fake-paths: ok');
