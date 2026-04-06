#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildCurrentAttachmentMetaFromIngest } from '../src/features/founderSlackFileTurn.js';

const meta = buildCurrentAttachmentMetaFromIngest([
  { ok: false, filename: 'big.pdf', errorCode: 'oversized' },
  { ok: false, filename: 'x.bin', errorCode: 'unsupported_payload_signature' },
]);

assert.equal(meta.current_attachment_failures.length, 2);
for (const f of meta.current_attachment_failures) {
  assert.ok(f.reason.length > 10);
  assert.match(f.reason, /[가-힣]/);
  assert.ok(!/[a-z]+_[a-z0-9_]+/.test(f.reason));
}

console.log('ok: vnext13_13_humanized_attachment_failures');
