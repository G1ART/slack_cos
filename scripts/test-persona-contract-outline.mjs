/**
 * 페르소나 계약 3층 슬롯 SSOT (에픽 4 확장 궤적).
 */
import assert from 'node:assert';
import { COS_PERSONA_CONTRACT_LAYERS } from '../src/founder/personaContractOutline.js';

assert.ok(Array.isArray(COS_PERSONA_CONTRACT_LAYERS));
assert.deepStrictEqual([...COS_PERSONA_CONTRACT_LAYERS], [
  'system_prompt',
  'tool_scope',
  'deliverable_schema',
]);

console.log('test-persona-contract-outline: ok');
