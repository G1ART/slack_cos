/**
 * vNext.13.45 — Boot / schema: delegate_harness_team parameters include packets.
 */
import assert from 'node:assert';
import { getDelegateHarnessTeamParametersSnapshot } from '../src/founder/runFounderDirectConversation.js';

const snap = getDelegateHarnessTeamParametersSnapshot();
assert.ok(snap && snap.properties && typeof snap.properties === 'object');
const props = /** @type {Record<string, unknown>} */ (snap.properties);
assert.ok(Object.prototype.hasOwnProperty.call(props, 'packets'), 'packets property');
const keys = Object.keys(props).sort();
assert.ok(keys.includes('packets'));

console.log('test-delegate-schema-includes-packets: ok');
