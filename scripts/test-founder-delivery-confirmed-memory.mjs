import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleFounderSlackTurn } from '../src/founder/handleFounderSlackTurn.js';
import { readRecentThreadTurns, clearThread } from '../src/founder/threadMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-delivery');

const ch = `D${Date.now()}`;
await clearThread(`dm:${ch}`);

const stubOpenai = {
  responses: {
    create: async () => ({
      id: 'resp_stub',
      output: [],
      output_text: 'stub assistant reply',
    }),
  },
};

const event = {
  channel: ch,
  channel_type: 'im',
  text: 'hello founder',
  ts: '1.0',
  user: 'U1',
  files: [],
};

const out = await handleFounderSlackTurn({
  event,
  body: {},
  client: {},
  openai: stubOpenai,
  model: 'gpt-test',
  constitutionMarkdown: '# test',
  constitutionSha256: 'abc',
});

assert.equal(out.answer, 'stub assistant reply');
assert.equal(out.threadKey, `dm:${ch}`);

const turnsAfterTurn = await readRecentThreadTurns(out.threadKey, 20);
assert.equal(turnsAfterTurn.length, 1, 'only user turn before send success');
assert.equal(turnsAfterTurn[0].role, 'user');
assert.ok(!turnsAfterTurn.some((t) => t.role === 'assistant'), 'no assistant without confirmed send');

console.log('test-founder-delivery-confirmed-memory: ok');
