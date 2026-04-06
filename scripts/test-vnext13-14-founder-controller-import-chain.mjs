#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ctrl = fs.readFileSync(path.join(__dirname, '..', 'src/founder/founderSlackController.js'), 'utf8');

const banned = [
  'handleUserText',
  'runInboundAiRouter',
  'runInboundCommandRouter',
  'founderRequestPipeline',
  'finalizeSlackResponse',
];
for (const b of banned) {
  assert.equal(
    ctrl.includes(b),
    false,
    `founderSlackController must not reference ${b}`,
  );
}

console.log('ok: vnext13_14_founder_controller_import_chain');
