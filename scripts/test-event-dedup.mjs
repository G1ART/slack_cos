import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSlackEventDedupSummary } from '../src/runtime/env.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-event-dedup-'));
const dedupFile = path.join(tmp, 'slack-event-dedup.json');

delete process.env.SLACK_EVENT_DEDUP_DISABLE;
process.env.SLACK_EVENT_DEDUP_FILE = dedupFile;

if (!getSlackEventDedupSummary().includes(dedupFile)) {
  throw new Error(`env summary file mode expected path; got ${getSlackEventDedupSummary()}`);
}

const { shouldSkipEvent } = await import('../src/slack/eventDedup.js');

const body1 = { event_id: 'evt-dedup-file-1' };
if (shouldSkipEvent(body1, {}) !== false) {
  throw new Error('file dedup: first event must not be skipped');
}
if (shouldSkipEvent(body1, {}) !== true) {
  throw new Error('file dedup: duplicate event_id must be skipped');
}

const parsed = JSON.parse(fs.readFileSync(dedupFile, 'utf8'));
if (typeof parsed !== 'object' || parsed[`event_id:${body1.event_id}`] == null) {
  throw new Error('dedup json missing expected key');
}

process.env.SLACK_EVENT_DEDUP_DISABLE = '1';
if (!getSlackEventDedupSummary().startsWith('끔')) {
  throw new Error(`env summary disabled expected; got ${getSlackEventDedupSummary()}`);
}
if (shouldSkipEvent(body1, {}) !== false) {
  throw new Error('DEDUP_DISABLE: must not skip (always process)');
}

delete process.env.SLACK_EVENT_DEDUP_DISABLE;
delete process.env.SLACK_EVENT_DEDUP_FILE;

if (getSlackEventDedupSummary() !== '메모리(단일프로세스)') {
  throw new Error(`env summary memory expected; got ${getSlackEventDedupSummary()}`);
}

const bodyMem = { event_id: 'evt-dedup-memory-1' };
if (shouldSkipEvent(bodyMem, {}) !== false) {
  throw new Error('memory dedup: first event must not be skipped');
}
if (shouldSkipEvent(bodyMem, {}) !== true) {
  throw new Error('memory dedup: duplicate must be skipped');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-event-dedup: ok');
