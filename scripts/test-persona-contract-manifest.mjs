/**
 * G1 M2 (일부): in-repo persona contract manifest 형식·enum 정합.
 */
import assert from 'node:assert/strict';
import {
  loadPersonaContractManifest,
  validatePersonaContractManifestShape,
  PERSONA_CONTRACT_MANIFEST_REPO_PATH,
} from '../src/founder/personaContractManifest.js';

assert.equal(PERSONA_CONTRACT_MANIFEST_REPO_PATH, 'src/founder/personaContracts.manifest.json');

const m = loadPersonaContractManifest();
const err = validatePersonaContractManifestShape(m);
assert.equal(err, null, `manifest shape: ${err}`);
assert.ok(String(m.version || '').trim(), 'version');
assert.ok(Array.isArray(m.personas) && m.personas.length >= 5, 'five core personas');
const ids = new Set(m.personas.map((p) => String(p.id || '')));
for (const need of ['planner', 'researcher', 'implementer', 'reviewer', 'risk_gate']) {
  assert.ok(ids.has(need), `missing persona id ${need}`);
}

console.log('test-persona-contract-manifest: ok');
