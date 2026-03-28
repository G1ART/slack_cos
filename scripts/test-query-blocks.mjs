#!/usr/bin/env node
/** `queryResponseBlocks` — 기본 on, SLACK_QUERY_BLOCKS=0 시 문자열만; 관련 조회 버튼은 `effectiveQueryLine` + `queryNavButtons` */
import { wrapQueryFinalizePlainText, inboundPayloadPlainText } from '../src/slack/queryResponseBlocks.js';

const plain = '[계획상세] smoke\n\n- bullet one\n- two';

delete process.env.SLACK_QUERY_BLOCKS;
delete process.env.SLACK_QUERY_NAV_BUTTONS;
const wrapped = wrapQueryFinalizePlainText(plain);
if (typeof wrapped !== 'object' || !wrapped.blocks?.length) {
  console.error('FAIL expected blocks when SLACK_QUERY_BLOCKS unset');
  process.exit(1);
}
if (inboundPayloadPlainText(wrapped) !== plain) {
  console.error('FAIL plain text roundtrip');
  process.exit(1);
}
if (wrapped.blocks.some((b) => b.type === 'actions')) {
  console.error('FAIL no nav buttons without effectiveQueryLine');
  process.exit(1);
}

const withNav = wrapQueryFinalizePlainText(plain, { effectiveQueryLine: '계획상세 PLN-1' });
const last = withNav.blocks[withNav.blocks.length - 1];
if (
  last?.type !== 'actions' ||
  !last.elements?.some((e) => String(e.action_id || '').startsWith('g1cos_query_nav_'))
) {
  console.error('FAIL expected query nav actions block');
  process.exit(1);
}

process.env.SLACK_QUERY_NAV_BUTTONS = '0';
const navOff = wrapQueryFinalizePlainText(plain, { effectiveQueryLine: '계획상세 PLN-1' });
if (navOff.blocks.some((b) => b.type === 'actions')) {
  console.error('FAIL no actions when SLACK_QUERY_NAV_BUTTONS=0');
  process.exit(1);
}
delete process.env.SLACK_QUERY_NAV_BUTTONS;

process.env.SLACK_QUERY_BLOCKS = '0';
const blocksOffNavOn = wrapQueryFinalizePlainText(plain, { effectiveQueryLine: '계획상세 PLN-1' });
if (
  typeof blocksOffNavOn !== 'object' ||
  blocksOffNavOn.blocks?.length !== 1 ||
  blocksOffNavOn.blocks[0]?.type !== 'actions'
) {
  console.error('FAIL blocks off but nav on → { text, blocks:[actions] }');
  process.exit(1);
}
delete process.env.SLACK_QUERY_BLOCKS;

process.env.SLACK_QUERY_BLOCKS = '0';
const off = wrapQueryFinalizePlainText(plain);
if (typeof off !== 'string' || off !== plain) {
  console.error('FAIL expected raw string when SLACK_QUERY_BLOCKS=0');
  process.exit(1);
}
delete process.env.SLACK_QUERY_BLOCKS;

console.log('ok: query block kit wrap');