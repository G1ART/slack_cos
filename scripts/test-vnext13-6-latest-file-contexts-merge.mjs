#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  mergeFounderConversationState,
  getFounderConversationState,
} from '../src/founder/founderConversationState.js';
import { buildFounderFileContextEntry } from '../src/founder/founderFileContextRecord.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v136-lfc-'));
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
process.env.COS_FOUNDER_FILE_CONTEXT_CAP = '2';
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');

const tk = 'Dtest:1.0:Ux';
for (let i = 0; i < 3; i += 1) {
  const entry = buildFounderFileContextEntry(tk, {
    ok: true,
    file_id: `F${i}`,
    filename: `f${i}.txt`,
    mimetype: 'text/plain',
    text: `body ${i}`,
    summary: `sum ${i}`,
    truncated: false,
    char_count: 10,
  });
  await mergeFounderConversationState(tk, { latest_file_contexts: [entry] });
}

const st = await getFounderConversationState(tk);
assert.equal(st.latest_file_contexts.length, 2);
assert.ok(st.latest_file_contexts.every((x) => x.filename === 'f1.txt' || x.filename === 'f2.txt'));

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;
delete process.env.COS_FOUNDER_FILE_CONTEXT_CAP;

console.log('ok: vnext13_6_latest_file_contexts_merge');
