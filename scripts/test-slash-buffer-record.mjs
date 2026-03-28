#!/usr/bin/env node
/** `/g1cos` 버퍼 키·기록 스모크 (Bolt 없음) */
import assert from 'node:assert/strict';
import {
  buildSlashCommandBufferKey,
  recordSlashCommandExchange,
  getConversationTranscript,
  clearConversationBuffer,
} from '../src/features/slackConversationBuffer.js';

clearConversationBuffer();

assert.equal(
  buildSlashCommandBufferKey({ channel_id: 'CAAA', channel_name: 'general', user_id: 'U1' }),
  'ch:CAAA:slash:U1'
);
assert.equal(
  buildSlashCommandBufferKey({ channel_id: 'DBBB', channel_name: 'directmessage', user_id: 'U1' }),
  'im:DBBB'
);
assert.equal(buildSlashCommandBufferKey({ channel_id: 'DCCC', user_id: 'U1' }), 'im:DCCC');

const cmd = { channel_id: 'CZ', channel_name: 'x', user_id: 'UZ' };
recordSlashCommandExchange(cmd, '/g1cos 계획진행 PLN-1', '[조회 응답 스텁]');
const key = 'ch:CZ:slash:UZ';
const tr = getConversationTranscript(key);
assert.ok(tr.includes('/g1cos') && tr.includes('조회'), tr);

clearConversationBuffer();
process.env.CONVERSATION_BUFFER_RECORD_SLASH = 'false';
recordSlashCommandExchange(cmd, 'a', 'b');
assert.equal(getConversationTranscript(key), '');

delete process.env.CONVERSATION_BUFFER_RECORD_SLASH;
clearConversationBuffer();

console.log('ok: slash buffer record');
