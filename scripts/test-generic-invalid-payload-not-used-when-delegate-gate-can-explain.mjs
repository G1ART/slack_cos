/**
 * vNext.13.50 — Founder safe block message uses machine delegate gate lines, not generic invalid_payload fallback.
 */
import assert from 'node:assert';
import {
  formatFounderSafeToolBlockMessage,
  shouldReplaceFounderTextWithSafeToolBlockMessage,
} from '../src/founder/runFounderDirectConversation.js';
import {
  DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
  DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
} from '../src/founder/toolsBridge.js';

const toolBlocked = [
  {
    status: 'blocked',
    blocked_reason: DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
    machine_hint: 'live_only_emit_patch_requires_delegate_packets',
    missing_required_fields: ['packets', 'live_patch'],
  },
];

assert.equal(shouldReplaceFounderTextWithSafeToolBlockMessage(toolBlocked), true);
const msg = formatFounderSafeToolBlockMessage(toolBlocked);
assert.ok(msg.includes(DELEGATE_REQUIRED_BEFORE_EMIT_PATCH));
assert.ok(msg.includes('live_only_emit_patch_requires_delegate_packets'));
assert.ok(!msg.includes('validator rejected; exact missing field not captured'));

const missing = [
  {
    status: 'blocked',
    blocked_reason: DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
    machine_hint: 'emit_patch_requires_delegate_merge_or_packet_scope',
    missing_required_fields: ['packets', 'live_patch'],
  },
];
const msg2 = formatFounderSafeToolBlockMessage(missing);
assert.ok(msg2.includes(DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH));

console.log('test-generic-invalid-payload-not-used-when-delegate-gate-can-explain: ok');
