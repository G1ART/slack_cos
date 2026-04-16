/**
 * W5-A: classifyToolInvocationPrecheck 가 externalToolLaneRegistry 각 lane 의 legacy precheck 결과에
 * failure_classification(resolution_class · human_gate_*) 을 승격해서 반환한다.
 * 기존 { blocked, blocked_reason, next_required_input } shape 는 보존(하위 호환).
 */
import assert from 'node:assert/strict';
import {
  classifyToolInvocationPrecheck,
  resolveLaneStaticResolutionClass,
} from '../src/founder/toolPlane/externalToolLaneRegistry.js';
import { FAILURE_RESOLUTION_CLASSES } from '../src/founder/failureTaxonomy.js';

const GITHUB_MISSING_TOKEN_ENV = {
  GITHUB_TOKEN: '',
  GITHUB_FINE_GRAINED_PAT: '',
  GITHUB_REPOSITORY: 'acme/foo',
};
const GITHUB_MISSING_REPO_ENV = {
  GITHUB_TOKEN: 'x',
  GITHUB_REPOSITORY: '',
  GITHUB_DEFAULT_OWNER: '',
  GITHUB_DEFAULT_REPO: '',
};
const GITHUB_MISSING_PAYLOAD_ENV = {
  GITHUB_TOKEN: 'x',
  GITHUB_REPOSITORY: 'acme/foo',
};
const SUPABASE_MISSING_CRED_ENV = {
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
};
const SUPABASE_MISSING_PAYLOAD_ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srk_x',
};
const RAILWAY_MISSING_TOKEN_ENV = {
  RAILWAY_TOKEN: '',
};
const RAILWAY_INSPECT_NO_ID_ENV = {
  RAILWAY_TOKEN: 'x',
  RAILWAY_DEPLOYMENT_ID: '',
};

{
  const r = classifyToolInvocationPrecheck('github', 'open_pr', {}, GITHUB_MISSING_TOKEN_ENV);
  assert.equal(r.blocked, true);
  assert.ok(typeof r.blocked_reason === 'string' && r.blocked_reason.length > 0);
  assert.ok(r.failure_classification, 'classification attached when blocked');
  assert.equal(r.failure_classification.resolution_class, 'hil_required_external_auth');
  assert.equal(r.failure_classification.human_gate_required, true);
  assert.equal(r.failure_classification.retryable, false);
  assert.ok(r.failure_classification.human_gate_reason && r.failure_classification.human_gate_reason.length > 0);
}

{
  const r = classifyToolInvocationPrecheck('github', 'open_pr', {}, GITHUB_MISSING_REPO_ENV);
  assert.equal(r.blocked, true);
  assert.ok(r.failure_classification);
  assert.equal(r.failure_classification.resolution_class, 'tenancy_or_binding_ambiguity');
  assert.equal(r.failure_classification.human_gate_required, true);
}

{
  const r = classifyToolInvocationPrecheck('github', 'open_pr', {}, GITHUB_MISSING_PAYLOAD_ENV);
  assert.equal(r.blocked, true);
  assert.equal(r.next_required_input, 'head', 'legacy next_required_input preserved');
  assert.equal(r.failure_classification.resolution_class, 'model_coordination_failure');
  assert.equal(r.failure_classification.human_gate_required, false);
  assert.equal(r.failure_classification.retryable, true);
}

{
  const r = classifyToolInvocationPrecheck('supabase', 'apply_sql', { sql: 'select 1' }, SUPABASE_MISSING_CRED_ENV);
  assert.equal(r.blocked, true);
  assert.equal(r.failure_classification.resolution_class, 'hil_required_external_auth');
}

{
  const r = classifyToolInvocationPrecheck('supabase', 'apply_sql', {}, SUPABASE_MISSING_PAYLOAD_ENV);
  assert.equal(r.blocked, true);
  assert.equal(r.next_required_input, 'sql');
  assert.equal(r.failure_classification.resolution_class, 'model_coordination_failure');
  assert.ok(r.failure_classification.human_gate_action && r.failure_classification.human_gate_action.includes('sql'));
}

{
  const r = classifyToolInvocationPrecheck('railway', 'inspect_logs', {}, RAILWAY_MISSING_TOKEN_ENV);
  assert.equal(r.blocked, true);
  assert.equal(r.failure_classification.resolution_class, 'hil_required_external_auth');
}

{
  const r = classifyToolInvocationPrecheck('railway', 'inspect_logs', {}, RAILWAY_INSPECT_NO_ID_ENV);
  assert.equal(r.blocked, true);
  assert.equal(r.next_required_input, 'deployment_id');
  assert.equal(r.failure_classification.resolution_class, 'model_coordination_failure');
}

{
  const r = classifyToolInvocationPrecheck('railway', 'deploy', {}, { RAILWAY_TOKEN: 'x' });
  assert.equal(r.blocked, false, 'railway deploy block lives at adapter.canExecuteLive, not precheck');
  assert.equal(r.failure_classification, null);
}

{
  const r = classifyToolInvocationPrecheck('railway', 'deploy', {}, { RAILWAY_TOKEN: '' });
  assert.equal(r.blocked, false, 'railway precheck only guards inspect_logs');
}

{
  const r = classifyToolInvocationPrecheck('vercel', 'deploy', {}, {});
  assert.equal(r.blocked, false);
  assert.equal(r.blocked_reason, null);
  assert.equal(r.failure_classification, null, 'non-blocked precheck produces no classification');
}

{
  const r = classifyToolInvocationPrecheck('cursor', 'trigger_automation', {}, {});
  assert.equal(r.blocked, false);
  assert.equal(r.failure_classification, null);
}

assert.equal(resolveLaneStaticResolutionClass('github', 'missing GITHUB_TOKEN'), 'hil_required_external_auth');
assert.equal(resolveLaneStaticResolutionClass('github', ''), null);
assert.equal(resolveLaneStaticResolutionClass('vercel', 'anything'), null);
assert.equal(resolveLaneStaticResolutionClass('unknown_tool', 'missing GITHUB_TOKEN'), null);

for (const rc of FAILURE_RESOLUTION_CLASSES) {
  assert.ok(typeof rc === 'string', 'registry imports are frozen from SSOT');
}

console.log('test-tool-lane-precheck-emits-classification: ok');
