#!/usr/bin/env node
/** `CONVERSATION_BUFFER_PERSIST` + 파일 로드/플러시 스모크 (임시 디렉터리) */
import { readFile, writeFile, mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import assert from 'node:assert/strict';

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'g1cos-buf-'));
const bufFile = path.join(tmpDir, 'buffer.json');

process.env.CONVERSATION_BUFFER_PERSIST = 'true';
process.env.CONVERSATION_BUFFER_FILE = bufFile;
process.env.CONVERSATION_BUFFER_DISABLE = 'false';

const m = await import('../src/features/slackConversationBuffer.js');

await m.loadConversationBufferFromDisk();

m.recordConversationTurn('im:test-u1', 'user', 'hello persist');
await m.flushConversationBufferToDisk();

const j1 = JSON.parse(await readFile(bufFile, 'utf8'));
assert.equal(j1.version, 1);
assert.ok(Array.isArray(j1.buckets) && j1.buckets.length >= 1);

m.clearConversationBuffer();
await m.flushConversationBufferToDisk();

await writeFile(
  bufFile,
  JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    buckets: [
      [
        'im:reload',
        {
          messages: [
            { role: 'user', text: 'from disk', at: new Date().toISOString() },
          ],
          touch: 1,
        },
      ],
    ],
  }),
  'utf8'
);

await m.loadConversationBufferFromDisk();
const tr = m.getConversationTranscript('im:reload');
assert.ok(tr.includes('from disk'), tr);

await rm(tmpDir, { recursive: true, force: true });
console.log('ok: conversation buffer persist');
