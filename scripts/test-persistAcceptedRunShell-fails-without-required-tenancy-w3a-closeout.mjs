/**
 * W3-A closeout: persistAcceptedRunShell returns null when required tenancy is missing.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetCosRunMemoryStore, persistAcceptedRunShell } from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;
const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedParcel = process.env.COS_PARCEL_DEPLOYMENT_KEY;

try {
  delete process.env.COS_MEMORY_TEST_TENANCY_DEFAULTS;
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w3a-persist-tenancy');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.COS_WORKSPACE_KEY;
  delete process.env.COS_PRODUCT_KEY;
  delete process.env.COS_PROJECT_SPACE_KEY;
  delete process.env.COS_PARCEL_DEPLOYMENT_KEY;

  __resetCosRunMemoryStore();

  const tk = `dm:w3a-persist-block-${Date.now()}`;
  const dispatch = {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_w3a_persist',
    objective: 'blocked',
    packets: [
      {
        packet_id: 'p_w3a_persist',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  };
  const shell = await persistAcceptedRunShell({ threadKey: tk, dispatch, founder_request_summary: 'x' });
  assert.equal(shell, null);
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

console.log('test-persistAcceptedRunShell-fails-without-required-tenancy-w3a-closeout: ok');
