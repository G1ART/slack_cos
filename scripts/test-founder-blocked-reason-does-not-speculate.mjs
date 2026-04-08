/**
 * vNext.13.46 — Founder-safe tool block copy: machine hints only, no speculation phrases.
 */
import assert from 'node:assert';
import { formatFounderSafeToolBlockMessage } from '../src/founder/runFounderDirectConversation.js';

const speculative = '줄바꿈 때문에 두 줄로 읽혔을 수 있습니다';
const withSpeculation = `도구가 막혔습니다. ${speculative}`;
assert.ok(withSpeculation.includes('줄바꿈'));

const safeEmpty = formatFounderSafeToolBlockMessage([{ blocked: true, reason: 'invalid_payload' }]);
assert.ok(!safeEmpty.includes('줄바꿈'));
assert.ok(safeEmpty.includes('invalid_payload'));
assert.ok(safeEmpty.includes('exact missing field not captured'));

const safeHint = formatFounderSafeToolBlockMessage([
  { blocked: true, reason: 'invalid_payload', machine_hint: 'live-only / no-fallback constraints missing' },
]);
assert.ok(safeHint.includes('live-only'));
assert.ok(!safeHint.includes('줄바꿈'));

const safeEmit = formatFounderSafeToolBlockMessage([
  {
    degraded_from: 'emit_patch_cloud_contract_not_met',
    missing_required_fields: ['ops', 'title'],
    emit_patch_machine_hints: ['emit_patch required field missing: ops'],
  },
]);
assert.ok(safeEmit.includes('ops'));
assert.ok(!safeEmit.includes('추측'));
assert.ok(!safeEmit.includes('아마'));

console.log('test-founder-blocked-reason-does-not-speculate: ok');
