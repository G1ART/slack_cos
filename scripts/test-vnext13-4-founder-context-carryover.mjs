#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  mergeFounderConversationState,
  getFounderConversationState,
  founderStateToSnapshot,
} from '../src/founder/founderConversationState.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v134-cc-'));
process.env.FOUNDER_CONVERSATION_STATE_FILE = path.join(tmp, 'fc.json');
await fs.writeFile(process.env.FOUNDER_CONVERSATION_STATE_FILE, '{"by_thread":{}}', 'utf8');

const tk = 'Dcc:1.0:U1';
await mergeFounderConversationState(
  tk,
  {
    decisions: ['MVP booking only'],
    north_star: 'gallery calendar',
    constraints: ['no payments'],
  },
  {},
);

const st = await getFounderConversationState(tk);
const snap = founderStateToSnapshot(st);
assert.ok(snap.recent_decisions.some((d) => d.includes('booking')));
assert.ok(String(snap.state_snapshot?.north_star || '').includes('gallery'));

const m = { source_type: 'direct_message', channel: 'Dcc', user: 'U1', ts: '1.0' };
const frame = synthesizeFounderContext({
  threadKey: tk,
  metadata: m,
  conversationStateSnapshot: snap,
});
assert.equal(frame.north_star_hint, 'gallery calendar');
assert.ok(frame.recent_decisions.some((d) => d.includes('booking')));

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.FOUNDER_CONVERSATION_STATE_FILE;

console.log('ok: vnext13_4_founder_context_carryover');
