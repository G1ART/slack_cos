#!/usr/bin/env node
import assert from 'node:assert/strict';
import { founderPlainTextHasForbiddenMarkers } from '../src/core/founderOutbound.js';

assert.equal(founderPlainTextHasForbiddenMarkers('strategy_finance: 시장'), false);
assert.equal(founderPlainTextHasForbiddenMarkers('risk_review: 주의'), false);
assert.equal(founderPlainTextHasForbiddenMarkers('[COS 제안 패킷]'), true);

console.log('ok: vnext13_8_founder_output_no_council_sections');
