/**
 * vNext.13.46 — Boot snapshot helper matches app.js cos_boot_delegate_schema packets flag.
 */
import assert from 'node:assert';
import { getDelegateBootSchemaSnapshot } from '../src/founder/runFounderDirectConversation.js';

const snap = getDelegateBootSchemaSnapshot();
assert.equal(snap.delegate_schema_includes_packets, true);
assert.ok(Array.isArray(snap.delegate_parameter_keys));
assert.ok(snap.delegate_parameter_keys.includes('packets'));

console.log('test-delegate-schema-boot-snapshot-shows-packets-true: ok');
