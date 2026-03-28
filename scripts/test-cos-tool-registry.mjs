#!/usr/bin/env node
/**
 * COS_TOOL_REGISTRY_V0 — 파이프라인·게이트 필드, 텔레메트리, invokePlanQueryTool 스모크.
 */
import assert from 'node:assert/strict';
import { COS_TOOL_REGISTRY_V0 } from '../src/features/cosToolRegistry.js';
import {
  getCosToolDescriptor,
  inferCosToolRegistryIdFromResponder,
} from '../src/features/cosToolTelemetry.js';
import {
  describeToolApprovalPolicy,
  invokePlanQueryTool,
  logStructuredCommandToolRegistry,
} from '../src/features/cosToolRuntime.js';

const ids = new Set(COS_TOOL_REGISTRY_V0.map((t) => t.id));
assert.equal(ids.size, COS_TOOL_REGISTRY_V0.length, 'registry ids unique');

for (const t of COS_TOOL_REGISTRY_V0) {
  assert.ok(t.pipeline, `pipeline set: ${t.id}`);
  assert.ok(t.gate_policy, `gate_policy set: ${t.id}`);
  assert.equal(getCosToolDescriptor(t.id)?.id, t.id);
}

assert.equal(inferCosToolRegistryIdFromResponder('query'), 'plan_query');
assert.equal(inferCosToolRegistryIdFromResponder('planner'), 'plan_register');
assert.equal(inferCosToolRegistryIdFromResponder('navigator'), 'navigator');
assert.equal(inferCosToolRegistryIdFromResponder('council'), 'council');
assert.equal(inferCosToolRegistryIdFromResponder('dialog'), null);

const pol = describeToolApprovalPolicy('work_dispatch');
assert.equal(pol?.gate_policy, 'high_risk_execute');
assert.equal(pol?.risk, 'high');

logStructuredCommandToolRegistry(''); // no throw
logStructuredCommandToolRegistry('커서발행 WRK-1');
logStructuredCommandToolRegistry('승인대기');
logStructuredCommandToolRegistry('승인 APR-1');

const q = await invokePlanQueryTool('계획상세 PLN-FAKE-REGISTRY-SMOKE-999', {
  raw_text: 'test',
  normalized_text: '계획상세 PLN-FAKE-REGISTRY-SMOKE-999',
});
assert.ok(q != null, 'invokePlanQueryTool returns query path');
assert.ok(
  typeof q === 'string' || (typeof q === 'object' && q.text),
  'finalize-shaped output'
);

console.log('ok: cos tool registry v0 runtime');
