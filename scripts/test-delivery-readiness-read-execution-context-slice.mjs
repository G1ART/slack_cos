/**
 * W8-D — founderCosToolHandlers 가 read_execution_context 반환에 delivery_readiness 3 슬라이스
 * (delivery_readiness_compact_lines · unresolved_human_gates_compact_lines · last_propagation_failures_lines)
 * 를 포함하는지 정적/런타임 혼합 검증. 그리고 이 배열들이 비 객체(비 함수) 의 순수 string[] 인지 검증.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const src = fs.readFileSync(
  path.join(ROOT, 'src/founder/founderCosToolHandlers.js'),
  'utf8',
);
assert.ok(src.includes("from './deliveryReadiness.js'"));
assert.ok(src.includes('loadDeliveryReadiness'));
assert.ok(src.includes('delivery_readiness_compact_lines'));
assert.ok(src.includes('unresolved_human_gates_compact_lines'));
assert.ok(src.includes('last_propagation_failures_lines'));

// runtime smoke of buildDeliveryReadiness output shape
const { buildDeliveryReadiness } = await import('../src/founder/deliveryReadiness.js');
const r = buildDeliveryReadiness({
  project_space_key: 'ps_alpha',
  binding_graph: { unfulfilled_requirements: [], satisfied_requirements: [] },
  open_human_gates: [],
  recent_propagation_runs: [],
});
for (const key of [
  'delivery_readiness_compact_lines',
  'unresolved_human_gates_compact_lines',
  'last_propagation_failures_lines',
]) {
  assert.ok(Array.isArray(r[key]), `${key} must be array`);
  for (const line of r[key]) {
    assert.equal(typeof line, 'string', `${key}: lines must be strings only`);
  }
}
// verdict enum
assert.ok(['ready', 'missing_binding', 'open_gate', 'propagation_failed'].includes(r.verdict));

console.log('test-delivery-readiness-read-execution-context-slice: ok');
