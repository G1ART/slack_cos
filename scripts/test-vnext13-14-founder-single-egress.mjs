#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rh = fs.readFileSync(path.join(root, 'src/slack/registerHandlers.js'), 'utf8');

const mStart = rh.indexOf("slackApp.event('app_mention'");
const mEnd = rh.indexOf("slackApp.event('message'", mStart);
const mentionBlock = rh.slice(mStart, mEnd);
assert.equal(/await\s+say\s*\(/u.test(mentionBlock), false, 'mention: no direct await say(');
assert.equal(
  mentionBlock.includes('client.chat.postMessage'),
  false,
  'mention: no direct client.chat.postMessage',
);

const dStart = mEnd;
const dEnd = rh.indexOf('// Interactive approval', dStart);
const dmBlock = rh.slice(dStart, dEnd);
assert.equal(/await\s+say\s*\(/u.test(dmBlock), false, 'DM: no direct await say(');
assert.equal(dmBlock.includes('client.chat.postMessage'), false, 'DM: no direct client.chat.postMessage');

console.log('ok: vnext13_14_founder_single_egress');
