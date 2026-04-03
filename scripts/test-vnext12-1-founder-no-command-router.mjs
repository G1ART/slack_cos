#!/usr/bin/env node
/** vNext.12.1 — app.js 창업자 블록 안에 runInboundCommandRouter 문자열이 없음(헌법 불변식). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

const start = src.indexOf('if (founderRoute) {');
const marker = '// Constitutional pipeline v1.1 — work_object';
const end = src.indexOf(marker);
assert.ok(start !== -1 && end !== -1 && end > start, 'founder block boundaries');
const founderBlock = src.slice(start, end);
assert.ok(
  !founderBlock.includes('runInboundCommandRouter'),
  'founder kernel block must not call runInboundCommandRouter',
);
assert.ok(
  !founderBlock.includes('runInboundAiRouter'),
  'founder kernel block must not call runInboundAiRouter',
);

console.log('ok: vnext12_1_founder_no_command_router');
