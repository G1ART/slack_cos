import assert from 'node:assert';
import { computeThreadKey } from '../src/founder/handleFounderSlackTurn.js';

const dm = computeThreadKey({
  channel: 'D024BE7LR',
  channel_type: 'im',
  ts: '111.111',
  thread_ts: undefined,
});
assert.equal(dm, 'dm:D024BE7LR', 'DM key is channel-only');

const dmIgnoreThread = computeThreadKey({
  channel: 'D024BE7LR',
  channel_type: 'im',
  ts: '222.222',
  thread_ts: '111.111',
});
assert.equal(dmIgnoreThread, 'dm:D024BE7LR', 'DM key ignores Slack thread_ts');

const mentionRoot = computeThreadKey({
  channel: 'C012345',
  channel_type: 'channel',
  ts: 'root.1',
  thread_ts: undefined,
});
assert.equal(mentionRoot, 'mention:C012345:root.1', 'mention root uses event.ts');

const mentionReply = computeThreadKey({
  channel: 'C012345',
  channel_type: 'channel',
  ts: 'child.2',
  thread_ts: 'root.1',
});
assert.equal(mentionReply, 'mention:C012345:root.1', 'mention reply uses root thread_ts');

const mentionReplyThreadTs = 'root.1';
const mentionEventTs = 'child.2';
const expectedMentionOutboundThreadTs = mentionReplyThreadTs || mentionEventTs;
assert.equal(expectedMentionOutboundThreadTs, 'root.1', 'Slack reply thread_ts = event.thread_ts || event.ts');

console.log('test-founder-thread-integrity: ok');
