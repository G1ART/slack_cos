/**
 * G1 M5 Truth stack: `read_execution_context.active_run_shell` 가 durable 활성 런과 정합한다.
 */
import assert from 'node:assert/strict';
import {
  __resetCosRunMemoryStore,
  persistAcceptedRunShell,
  patchRunById,
  getActiveRunForThread,
  activeRunShellForCosExecutionContext,
} from '../src/founder/executionRunStore.js';
import { handleReadExecutionContext } from '../src/founder/runFounderDirectConversation.js';

const savedStore = process.env.COS_RUN_STORE;
const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedDep = process.env.COS_PARCEL_DEPLOYMENT_KEY;

try {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.COS_RUN_STORE = 'memory';
  process.env.COS_WORKSPACE_KEY = 'truth_stack_env_ws';
  process.env.COS_PRODUCT_KEY = 'truth_stack_env_prod';
  process.env.COS_PROJECT_SPACE_KEY = 'truth_stack_env_ps';
  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'truth_stack_slice_test';

  assert.equal(activeRunShellForCosExecutionContext(null), null);
  assert.equal(activeRunShellForCosExecutionContext({}), null);

  __resetCosRunMemoryStore();

  const tk = `dm:truth-shell-${Date.now()}`;
  const dispatch = {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_shell',
    objective: 'truth shell',
    packets: [
      {
        packet_id: 'p1',
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
  await patchRunById(rid, { workspace_key: 'T_SHELL', product_key: 'P_SHELL' });

  const active = await getActiveRunForThread(tk);
  assert.ok(active);
  const projected = activeRunShellForCosExecutionContext(active);
  assert.ok(projected);
  assert.equal(projected.id, rid);
  assert.equal(projected.status, String(active.status));
  assert.equal(projected.workspace_key, 'T_SHELL');
  assert.equal(projected.product_key, 'P_SHELL');

  const ctx = await handleReadExecutionContext({ limit: 5 }, tk);
  assert.ok(ctx.active_run_shell);
  assert.equal(ctx.active_run_shell.id, projected.id);
  assert.equal(ctx.active_run_shell.status, projected.status);
  assert.equal(ctx.active_run_shell.workspace_key, 'T_SHELL');
  assert.ok(Array.isArray(ctx.execution_summary_active_run), 'active-run scoped summary lines');
  assert.ok(ctx.parcel_ledger_closure_mirror && typeof ctx.parcel_ledger_closure_mirror.count === 'number');
  assert.equal(ctx.parcel_deployment_scoped_supervisor_lists, true);
  assert.equal(ctx.tenancy_keys_presence?.parcel_deployment, true);
  assert.equal(ctx.workspace_key, 'T_SHELL');
  assert.equal(ctx.product_key, 'P_SHELL');
  assert.equal(ctx.project_space_key, 'truth_stack_env_ps');
  assert.equal(ctx.parcel_deployment_key, 'truth_stack_slice_test');
} finally {
  if (savedStore === undefined) delete process.env.COS_RUN_STORE;
  else process.env.COS_RUN_STORE = savedStore;
  if (savedWs === undefined) delete process.env.COS_WORKSPACE_KEY;
  else process.env.COS_WORKSPACE_KEY = savedWs;
  if (savedProd === undefined) delete process.env.COS_PRODUCT_KEY;
  else process.env.COS_PRODUCT_KEY = savedProd;
  if (savedPs === undefined) delete process.env.COS_PROJECT_SPACE_KEY;
  else process.env.COS_PROJECT_SPACE_KEY = savedPs;
  if (savedDep === undefined) delete process.env.COS_PARCEL_DEPLOYMENT_KEY;
  else process.env.COS_PARCEL_DEPLOYMENT_KEY = savedDep;
}

console.log('test-truth-stack-active-run-shell: ok');
