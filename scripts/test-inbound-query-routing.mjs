/**
 * rich_text vs text 불일치 / 굵게 아티팩트 시 query 접두사가 살아남는지
 */
import assert from 'assert';
import {
  normalizeSlackCommandDecorations,
  getInboundCommandText,
} from '../src/slack/inboundText.js';

assert.strictEqual(normalizeSlackCommandDecorations('*계획상세* PLN-1'), '계획상세 PLN-1');
assert.strictEqual(normalizeSlackCommandDecorations('`*계획발행목록*` PLN-2'), '계획발행목록 PLN-2');

const richTextEvent = {
  text: '<@UABC>',
  blocks: [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [{ type: 'text', text: '계획상세 PLN-260320-08' }],
        },
      ],
    },
  ],
};
assert.strictEqual(getInboundCommandText(richTextEvent), '계획상세 PLN-260320-08', '멘션만 text에 있고 명령은 blocks');

const splitEvent = {
  text: '<@UABC> PLN-260320-08',
  blocks: [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [{ type: 'text', text: '계획발행목록 PLN-260320-08' }],
        },
      ],
    },
  ],
};
assert.strictEqual(
  getInboundCommandText(splitEvent),
  '계획발행목록 PLN-260320-08',
  'text에는 PLN만, blocks에 전체 명령'
);

console.log('ok: inbound_query_routing');
