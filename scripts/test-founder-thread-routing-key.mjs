/**
 * 채널 스레드 후속: thread_key = mention:channel:root_ts, 라우팅 파일과 정합.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { saveSlackRouting, getSlackRouting } from '../src/founder/slackRoutingStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-thread-routing');

const ch = 'C0TESTTHREAD';
const root = '1234567890.000001';
const threadKey = `mention:${ch}:${root}`;
await saveSlackRouting(threadKey, { channel: ch, thread_ts: root });
const got = await getSlackRouting(threadKey);
assert.ok(got);
assert.equal(got.channel, ch);
assert.equal(got.thread_ts, root);

console.log('test-founder-thread-routing-key: ok');
