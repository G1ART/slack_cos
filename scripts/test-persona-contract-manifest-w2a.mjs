/**
 * W2-A: persona manifest strict fields + harness envelope contract rejection.
 */
import assert from 'node:assert/strict';
import {
  loadPersonaContractManifest,
  validatePersonaContractManifestShape,
  getPersonaContractRowByDelegateEnum,
  formatPersonaContractRuntimeSnapshotLines,
} from '../src/founder/personaContractManifest.js';
import { validatePersonaContractHarnessEnvelope } from '../src/founder/personaContractHarness.js';

const m = loadPersonaContractManifest();
assert.equal(validatePersonaContractManifestShape(m), null);

const eng = getPersonaContractRowByDelegateEnum('engineering');
assert.ok(eng && Array.isArray(eng.allowed_tools) && eng.allowed_tools.includes('cursor'));
assert.ok(Array.isArray(eng.allowed_actions) && eng.allowed_actions.includes('emit_patch'));
assert.equal(String(eng.required_output_mode), 'live_when_ready');

const snap = formatPersonaContractRuntimeSnapshotLines(['pm', 'engineering'], 8);
assert.ok(snap.length >= 2);
assert.ok(snap.some((line) => line.startsWith('pm|')));

const bad = validatePersonaContractHarnessEnvelope({
  objective: 'x',
  personas: ['pm'],
  packets: [
    {
      persona: 'pm',
      mission: 'm',
      preferred_tool: 'vercel',
      preferred_action: 'deploy',
    },
  ],
});
assert.equal(bad.blocked, true);
assert.ok(String(bad.blocked_reason || '').includes('persona_contract_tool_not_allowed'));

console.log('test-persona-contract-manifest-w2a: ok');
