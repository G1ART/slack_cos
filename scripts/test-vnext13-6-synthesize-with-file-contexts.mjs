#!/usr/bin/env node
import assert from 'node:assert/strict';
import { founderStateToSnapshot } from '../src/founder/founderConversationState.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';

const state = {
  thread_key: 'Dz:1.0:U1',
  latest_file_contexts: [
    {
      filename: 'brief.pdf',
      summary: '요약 한 줄',
      extract_status: 'ok',
      attached_at: '2026-04-01T00:00:00.000Z',
      thread_key: 'Dz:1.0:U1',
    },
  ],
};

const snap = founderStateToSnapshot(state);
assert.equal(snap.recent_file_contexts.length, 1);
assert.equal(snap.recent_file_contexts[0].filename, 'brief.pdf');

const m = { source_type: 'direct_message', channel: 'Dz', user: 'U1', ts: '1.0' };
const frame = synthesizeFounderContext({
  threadKey: 'Dz:1.0:U1',
  metadata: m,
  conversationStateSnapshot: snap,
});
assert.ok(Array.isArray(frame.recent_file_contexts));
assert.equal(frame.recent_file_contexts[0].filename, 'brief.pdf');
assert.ok(frame.constraints.some((c) => c.includes('Slack 파일 인테이크')));

console.log('ok: vnext13_6_synthesize_with_file_contexts');
