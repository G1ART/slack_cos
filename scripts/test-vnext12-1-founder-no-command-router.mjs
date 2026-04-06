#!/usr/bin/env node
/**
 * vNext.12.1 / vNext.13.14 — `handleUserText` 앞단에 창업자 전용 커널·라우터가 섞이지 않음.
 * 13.14 이후: 창업자 Slack은 `founderSlackController`가 처리; `handleUserText`는 `founder_route` 시 throw.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

assert.ok(src.includes('founder_route_must_not_use_handleUserText'), 'founder_route guard on handleUserText');
assert.ok(!src.includes('await runFounderDirectKernel'), 'app.js must not call runFounderDirectKernel');

const hStart = src.indexOf('async function handleUserText');
const v14 = src.indexOf('// vNext.13.14 — 창업자 멘션/DM은');
assert.ok(hStart !== -1 && v14 !== -1 && v14 > hStart, 'handleUserText and vNext.13.14 comment');
const preOperator = src.slice(hStart, v14);
assert.ok(!preOperator.includes('runInboundCommandRouter'), 'pre-operator slice must not mention command router');
assert.ok(!preOperator.includes('runInboundAiRouter'), 'pre-operator slice must not mention AI router');

console.log('ok: vnext12_1_founder_no_command_router');
