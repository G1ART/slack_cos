#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatePath = path.join(__dirname, '..', 'src', 'core', 'founderLaunchGate.js');
const src = fs.readFileSync(gatePath, 'utf8');
assert.ok(!src.includes('evaluatePolicy'));
assert.ok(!src.includes('renderFounderSurface'));
assert.ok(src.includes('formatFounderLaunchExecutionSurface'));
assert.ok(src.includes('formatFounderLaunchBlockedSurface'));
console.log('ok: vnext13_2_launch_gate_purification');
