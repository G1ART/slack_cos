#!/usr/bin/env node
import assert from 'node:assert/strict';
import { founderIngestSlackFilesWithState } from '../src/features/founderSlackFileTurn.js';

const counts = { mergeAttempts: 0, docAttempts: 0 };
await founderIngestSlackFilesWithState({
  files: [{ id: 'Fstub' }],
  client: {},
  threadKey: 'test-thread-vnext13-13',
  summarizePng: async () => ({ ok: true, text: 'x' }),
  persistToFounderState: false,
  persistToDocumentContext: false,
  _testPersistCounts: counts,
  ingestSlackFileFn: async () => ({
    ok: true,
    file_id: 'Fstub',
    filename: 'note.txt',
    text: 'hello',
    summary: 'hello',
  }),
});

assert.equal(counts.mergeAttempts, 0);
assert.equal(counts.docAttempts, 0);

console.log('ok: vnext13_13_no_founder_ingest_side_effects');
