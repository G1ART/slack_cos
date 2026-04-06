#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rh = fs.readFileSync(path.join(root, 'src/slack/registerHandlers.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const mStart = rh.indexOf("slackApp.event('app_mention'");
const mEnd = rh.indexOf("slackApp.event('message'", mStart);
const mentionBlock = rh.slice(mStart, mEnd);
assert.equal(mentionBlock.includes('handleUserText'), false, 'mention founder path must not call handleUserText');

const dStart = mEnd;
const dEnd = rh.indexOf('// Interactive approval', dStart);
const dmBlock = rh.slice(dStart, dEnd);
assert.equal(dmBlock.includes('handleUserText'), false, 'DM founder path must not call handleUserText');

assert.ok(
  app.includes('founder_route_must_not_use_handleUserText'),
  'app.js must guard handleUserText when founder_route',
);

console.log('ok: vnext13_14_founder_route_bypasses_handleUserText');
