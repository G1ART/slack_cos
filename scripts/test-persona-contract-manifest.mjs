/**
 * G1 M2 (일부): in-repo persona contract manifest 형식·enum 정합.
 */
import assert from 'node:assert/strict';
import {
  loadPersonaContractManifest,
  validatePersonaContractManifestShape,
  formatPersonaContractLinesForInstructions,
  PERSONA_CONTRACT_MANIFEST_REPO_PATH,
} from '../src/founder/personaContractManifest.js';

assert.equal(PERSONA_CONTRACT_MANIFEST_REPO_PATH, 'src/founder/personaContracts.manifest.json');

const m = loadPersonaContractManifest();
const err = validatePersonaContractManifestShape(m);
assert.equal(err, null, `manifest shape: ${err}`);
assert.ok(String(m.version || '').trim(), 'version');
assert.ok(Array.isArray(m.personas) && m.personas.length >= 6, 'six delegate personas in manifest');
const ids = new Set(m.personas.map((p) => String(p.id || '')));
for (const need of ['planner', 'researcher', 'implementer', 'reviewer', 'risk_gate', 'product_design']) {
  assert.ok(ids.has(need), `missing persona id ${need}`);
}
const impl = m.personas.find((p) => String(p.id) === 'implementer');
assert.ok(impl && Array.isArray(impl.allowed_tools) && impl.allowed_tools.includes('cursor'), 'implementer allows cursor');
assert.ok(
  impl && Array.isArray(impl.escalation_predicates) && impl.escalation_predicates.includes('contract_miss'),
  'implementer escalation_predicates',
);

const block = formatPersonaContractLinesForInstructions();
assert.ok(block.includes('planner→pm'), 'instruction block lists planner mapping');
assert.ok(block.includes('[페르소나 계약 manifest'), 'instruction block header');

console.log('test-persona-contract-manifest: ok');
