#!/usr/bin/env node
import assert from 'node:assert/strict';
import { founderPlainTextHasForbiddenMarkers } from '../src/core/founderOutbound.js';

const bad = `
*[COS 제안 패킷]*
내부 목차
`;
assert.equal(founderPlainTextHasForbiddenMarkers(bad), true);

const good =
  'PDF에서 핵심은 전시 구조와 수수료표입니다. 더 깊게 보려면 페이지 번호를 알려주세요.';
assert.equal(founderPlainTextHasForbiddenMarkers(good), false);

const nuanced = '가장 강한 반대 논리를 한 줄로 말하면 …';
assert.equal(founderPlainTextHasForbiddenMarkers(nuanced), false);

console.log('ok: vnext13_7_founder_surface_no_council_markers');
