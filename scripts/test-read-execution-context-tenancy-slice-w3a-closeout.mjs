/**
 * W3-A closeout: read_execution_context top-level tenancy slice mirrors active_run_shell.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetCosRunMemoryStore, persistAcceptedRunShell } from '../src/founder/executionRunStore.js';
import { handleReadExecutionContext } from '../src/founder/founderCosToolHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;
const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedParcel = process.env.COS_PARCEL_DEPLOYMENT_KEY;

try {
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w3a-readctx-tenancy');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.COS_WORKSPACE_KEY = 'w3a_ctx_ws';
  process.env.COS_PRODUCT_KEY = 'w3a_ctx_prod';
  process.env.COS_PROJECT_SPACE_KEY = 'w3a_ctx_ps';
  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'w3a_ctx_parcel';

  __resetCosRunMemoryStore();

  const tk = `dm:w3a-ten-slice-${Date.now()}`;
  const dispatch = {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_w3a_ctx',
    objective: 'w3a tenancy slice',
    packets: [
      {
        packet_id: 'p_w3a_ctx',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  };
  await persistAcceptedRunShell({ threadKey: tk, dispatch, founder_request_summary: 'w3a' });
  const ctx = await handleReadExecutionContext({ limit: 5 }, tk);
  assert.ok(ctx.active_run_shell && typeof ctx.active_run_shell === 'object');
  assert.equal(ctx.workspace_key, 'w3a_ctx_ws');
  assert.equal(ctx.product_key, 'w3a_ctx_prod');
  assert.equal(ctx.project_space_key, 'w3a_ctx_ps');
  assert.equal(ctx.parcel_deployment_key, 'w3a_ctx_parcel');
  assert.equal(ctx.active_run_shell.workspace_key, ctx.workspace_key);
  assert.equal(ctx.active_run_shell.product_key, ctx.product_key);
  assert.equal(ctx.persona_contract_snapshot_source, 'none');
  assert.equal(ctx.workcell_summary_source, 'none');
  assert.equal(ctx.active_run_truth_source, 'active_run_shell');
  assert.ok(ctx.tenancy_slice && typeof ctx.tenancy_slice === 'object');
  assert.equal(ctx.tenancy_slice.workspace_key, 'w3a_ctx_ws');
} finally {
  if (savedDir === undefined) delete process.env.COS_RUNTIME_STATE_DIR;
  else process.env.COS_RUNTIME_STATE_DIR = savedDir;
  if (savedStore === undefined) delete process.env.COS_RUN_STORE;
  else process.env.COS_RUN_STORE = savedStore;
  if (savedWs === undefined) delete process.env.COS_WORKSPACE_KEY;
  else process.env.COS_WORKSPACE_KEY = savedWs;
  if (savedProd === undefined) delete process.env.COS_PRODUCT_KEY;
  else process.env.COS_PRODUCT_KEY = savedProd;
  if (savedPs === undefined) delete process.env.COS_PROJECT_SPACE_KEY;
  else process.env.COS_PROJECT_SPACE_KEY = savedPs;
  if (savedParcel === undefined) delete process.env.COS_PARCEL_DEPLOYMENT_KEY;
  else process.env.COS_PARCEL_DEPLOYMENT_KEY = savedParcel;
}

console.log('test-read-execution-context-tenancy-slice-w3a-closeout: ok');
