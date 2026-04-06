#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildFounderAttachmentPromptLines } from '../src/founder/founderDirectKernel.js';

const lines = buildFounderAttachmentPromptLines({
  failure_notes: ['first failure note from partition'],
  current_attachment_failures: [
    { filename: 'hidden.png', reason: 'must not appear when failure_notes set' },
  ],
});

const joined = lines.join('\n');
assert.ok(joined.includes('first failure note from partition'));
assert.ok(!joined.includes('hidden.png'));
assert.ok(!joined.includes('must not appear'));

console.log('ok: vnext13_13_founder_kernel_prefers_failure_notes');
