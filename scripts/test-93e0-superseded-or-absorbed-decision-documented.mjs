/**
 * vNext.13.50 — 93e0 branch disposition documented (superseded for emit_patch; optional create_spec UX only).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'docs', 'cursor-handoffs', 'COS_vNext13_50_93e0_Branch_Disposition.md');
const t = fs.readFileSync(p, 'utf8');
assert.ok(t.includes('superseded'), 'doc must state superseded');
assert.ok(t.includes('starterLadder.js'), 'doc must name changed file');
assert.ok(t.includes('create_spec'), 'doc must scope change to create_spec');
assert.ok(/Delete remote branch/i.test(t), 'doc must address delete');

console.log('test-93e0-superseded-or-absorbed-decision-documented: ok');
