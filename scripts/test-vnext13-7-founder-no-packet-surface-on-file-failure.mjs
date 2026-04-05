#!/usr/bin/env node
import assert from 'node:assert/strict';
import { formatFounderFileFailureOnlyMessage } from '../src/features/founderSlackFileTurn.js';
import { founderPlainTextHasForbiddenMarkers } from '../src/core/founderOutbound.js';

const msg = formatFounderFileFailureOnlyMessage([
  '파일 대신 HTML(미리보기·로그인 페이지 등)이 내려와 본문을 읽지 못했습니다.',
]);
assert.ok(!founderPlainTextHasForbiddenMarkers(msg));

const multi = formatFounderFileFailureOnlyMessage(['첫 오류입니다.', '둘째 오류입니다.']);
assert.ok(!multi.includes('[COS 제안 패킷]'));
assert.ok(!multi.includes('strategy_finance:'));

console.log('ok: vnext13_7_founder_no_packet_surface_on_file_failure');
