/**
 * 긴 모델 응답을 Slack 상한에 맞게 분할.
 */
import assert from 'node:assert';
import { chunkFounderSlackText } from '../src/founder/sendFounderResponse.js';

assert.deepEqual(chunkFounderSlackText(''), []);
assert.deepEqual(chunkFounderSlackText('  hi  '), ['hi']);
const long = 'x'.repeat(38_001);
const parts = chunkFounderSlackText(long);
assert.equal(parts.length, 2);
assert.equal(parts[0].length, 38_000);
assert.equal(parts[1].length, 1);

console.log('test-founder-send-chunk-slack-text: ok');
