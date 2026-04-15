import assert from 'node:assert/strict';
import { __resetCosRunEventsMemoryForTests, listOpsSmokePhaseEventsForSummary } from '../src/founder/runCosEvents.js';
import { recordCosCursorWebhookIngressSafe, recordOpsSmokeGithubFallbackEvidence } from '../src/founder/smokeOps.js';
import {
  COS_PARCEL_DEPLOYMENT_KEY_ENV,
  COS_WORKSPACE_KEY_ENV,
} from '../src/founder/parcelDeploymentContext.js';

const saved = {
  COS_RUN_STORE: process.env.COS_RUN_STORE,
  COS_OPS_SMOKE_ENABLED: process.env.COS_OPS_SMOKE_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  [COS_PARCEL_DEPLOYMENT_KEY_ENV]: process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV],
  [COS_WORKSPACE_KEY_ENV]: process.env[COS_WORKSPACE_KEY_ENV],
};

function restore() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

try {
  process.env.COS_RUN_STORE = 'memory';
  process.env.COS_OPS_SMOKE_ENABLED = '1';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env[COS_PARCEL_DEPLOYMENT_KEY_ENV] = 'rail_m1';
  process.env[COS_WORKSPACE_KEY_ENV] = 'T0M1TEST';
  __resetCosRunEventsMemoryForTests();

  await recordCosCursorWebhookIngressSafe({
    smoke_session_id: 'sess_direct_m1',
    run_id: null,
    thread_key: 'mention:C1:123',
    signature_verification_ok: true,
    json_parse_ok: true,
    correlation_outcome: 'matched',
  });
  await recordOpsSmokeGithubFallbackEvidence({
    smoke_session_id: 'sess_direct_m1',
    run_id: null,
    thread_key: 'mention:C1:123',
    match_attempted: true,
    matched: false,
    object_type: 'check_run',
    object_id: '71207089084',
  });

  const rows = await listOpsSmokePhaseEventsForSummary({
    modeOverride: 'memory',
    maxRows: 50,
  });
  const ingress = rows.find((r) => String(r.event_type) === 'cos_cursor_webhook_ingress_safe');
  const gh = rows.find((r) => String(r.event_type) === 'cos_github_fallback_evidence');
  assert.ok(ingress, 'cursor ingress safe row should exist');
  assert.ok(gh, 'github fallback evidence row should exist');

  const plIngress = ingress.payload && typeof ingress.payload === 'object' ? ingress.payload : {};
  const plGh = gh.payload && typeof gh.payload === 'object' ? gh.payload : {};
  assert.equal(String(plIngress.thread_key || ''), 'mention:C1:123');
  assert.equal(String(plIngress.workspace_key || ''), 'T0M1TEST');
  assert.equal(String(plIngress.parcel_deployment_key || ''), 'rail_m1');
  assert.equal(String(plGh.thread_key || ''), 'mention:C1:123');
  assert.equal(String(plGh.workspace_key || ''), 'T0M1TEST');
  assert.equal(String(plGh.parcel_deployment_key || ''), 'rail_m1');

  console.log('test-canonical-envelope-ops-direct-events: ok');
} finally {
  restore();
}
