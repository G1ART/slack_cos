#!/usr/bin/env node
import assert from 'node:assert/strict';
import { founderPlainTextHasForbiddenMarkers } from '../src/core/founderOutbound.js';

const bad = `
*[COS 제안 패킷]*
strategy_finance: 시장
가장 강한 반대 논리
`;
assert.equal(founderPlainTextHasForbiddenMarkers(bad), true);

const good = 'PDF에서 핵심은 전시 구조와 수수료표입니다. 더 깊게 보려면 페이지 번호를 알려주세요.';
assert.equal(founderPlainTextHasForbiddenMarkers(good), false);

console.log('ok: vnext13_7_founder_surface_no_council_markers');
