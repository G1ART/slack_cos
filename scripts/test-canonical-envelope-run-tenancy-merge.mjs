/**
 * M1 전달 2차: ALS 없이 cos_runs 행 테넄시가 smoke-summary payload 에 스며든다.
 */
import assert from 'node:assert/strict';
import { mergeCanonicalExecutionEnvelopeToPayload } from '../src/founder/canonicalExecutionEnvelope.js';
import {
  appendCosRunEventForRun,
  listCosRunEventsForRun,
  __resetCosRunEventsMemoryForTests,
} from '../src/founder/runCosEvents.js';
import {
  persistAcceptedRunShell,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';

const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedParcel = process.env.COS_PARCEL_DEPLOYMENT_KEY;
const savedStore = process.env.COS_RUN_STORE;

function restoreEnv() {
  if (savedWs === undefined) delete process.env.COS_WORKSPACE_KEY;
  else process.env.COS_WORKSPACE_KEY = savedWs;
  if (savedProd === undefined) delete process.env.COS_PRODUCT_KEY;
  else process.env.COS_PRODUCT_KEY = savedProd;
  if (savedPs === undefined) delete process.env.COS_PROJECT_SPACE_KEY;
  else process.env.COS_PROJECT_SPACE_KEY = savedPs;
  if (savedParcel === undefined) delete process.env.COS_PARCEL_DEPLOYMENT_KEY;
  else process.env.COS_PARCEL_DEPLOYMENT_KEY = savedParcel;
  if (savedStore === undefined) delete process.env.COS_RUN_STORE;
  else process.env.COS_RUN_STORE = savedStore;
}

try {
  delete process.env.COS_WORKSPACE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.COS_RUN_STORE = 'memory';

  const merged = mergeCanonicalExecutionEnvelopeToPayload(
    { smoke_session_id: 'u1' },
    {
      runId: 'r-uuid',
      threadKey: 'thread:k',
      runTenancy: {
        workspace_key: 'T_FROM_RUN',
        product_key: 'prod_row',
        parcel_deployment_key: 'dep_row',
      },
    },
    process.env,
  );
  assert.equal(String(merged.workspace_key || '').trim(), 'T_FROM_RUN');
  assert.equal(String(merged.product_key || '').trim(), 'prod_row');
  assert.equal(String(merged.parcel_deployment_key || '').trim(), 'dep_row');
  assert.equal(String(merged.run_id || '').trim(), 'r-uuid');
  assert.equal(String(merged.thread_key || '').trim(), 'thread:k');

  __resetCosRunMemoryStore();
  __resetCosRunEventsMemoryForTests();

  process.env.COS_WORKSPACE_KEY = 'env_ws_rtm';
  process.env.COS_PRODUCT_KEY = 'env_prod_rtm';
  process.env.COS_PROJECT_SPACE_KEY = 'env_ps_rtm';
  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'env_parcel_rtm';

  const tk = 'mention:test_run_tenancy_merge:1';
  const dispatch = {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_rtm',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_rtm',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  };
  const shell = await persistAcceptedRunShell({ threadKey: tk, dispatch, founder_request_summary: 's' });
  const rid = String(shell?.id || '');
  assert.ok(rid);
  await patchRunById(rid, { workspace_key: 'T_ROW_PATCHED', product_key: 'pk_mem' });

  // Envelope merge fills env before run-row hints; clear workspace/product env so
  // patched durable row wins (original test intent).
  delete process.env.COS_WORKSPACE_KEY;
  delete process.env.COS_PRODUCT_KEY;

  await appendCosRunEventForRun(rid, 'ops_smoke_phase', {
    smoke_session_id: 'sess_rtm',
    phase: 'cursor_trigger_recorded',
    at: '2026-04-16T12:00:00.000Z',
  });
  const rows = await listCosRunEventsForRun(rid, 5);
  assert.equal(rows.length, 1);
  const pl = rows[0].payload && typeof rows[0].payload === 'object' ? rows[0].payload : {};
  assert.equal(String(pl.workspace_key || '').trim(), 'T_ROW_PATCHED');
  assert.equal(String(pl.product_key || '').trim(), 'pk_mem');
} finally {
  restoreEnv();
}

console.log('test-canonical-envelope-run-tenancy-merge: ok');
