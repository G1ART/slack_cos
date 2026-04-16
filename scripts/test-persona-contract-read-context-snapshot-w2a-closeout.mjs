/**
 * W2-A closeout: read_execution_context persona_contract_snapshot_lines from run / ledger, not placeholder.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  __resetCosRunMemoryStore,
  persistAcceptedRunShell,
} from '../src/founder/executionRunStore.js';
import { handleReadExecutionContext } from '../src/founder/founderCosToolHandlers.js';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { appendExecutionArtifact, clearExecutionArtifacts } from '../src/founder/executionLedger.js';
import { mergeLedgerExecutionRowPayload } from '../src/founder/canonicalExecutionEnvelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;
const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedParcel = process.env.COS_PARCEL_DEPLOYMENT_KEY;

try {
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w2a-read-snapshot');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.COS_WORKSPACE_KEY = 'w2a_snap_ws';
  process.env.COS_PRODUCT_KEY = 'w2a_snap_prod';
  process.env.COS_PROJECT_SPACE_KEY = 'w2a_snap_ps';
  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'w2a_snap_parcel';

  __resetCosRunMemoryStore();

  const tk = `dm:w2a-snap-${Date.now()}`;

  const h = await runHarnessOrchestration(
    {
      objective: '스냅샷 검증',
      personas: ['pm'],
      tasks: ['t'],
      deliverables: ['d'],
      constraints: [],
    },
    { threadKey: tk },
  );
  assert.equal(h.ok, true);
  assert.ok(Array.isArray(h.persona_contract_runtime_snapshot) && h.persona_contract_runtime_snapshot.length >= 1);

  await persistAcceptedRunShell({
    threadKey: tk,
    dispatch: h,
    founder_request_summary: 'snap',
  });

  const ctx = await handleReadExecutionContext({ limit: 8 }, tk);
  assert.ok(Array.isArray(ctx.persona_contract_snapshot_lines));
  assert.ok(
    ctx.persona_contract_snapshot_lines.length >= 1,
    'snapshot lines should come from active run dispatch_payload',
  );
  assert.ok(
    ctx.persona_contract_snapshot_lines[0].includes('pm|'),
    'snapshot line should reflect delegate enum from dispatch',
  );
  assert.equal(ctx.persona_contract_snapshot_source, 'active_run_shell');

  await clearExecutionArtifacts(tk);
  __resetCosRunMemoryStore();

  const tk2 = `dm:w2a-art-${Date.now()}`;
  const snap = ['qa|reviewer|v2026-04-26|mode=artifact_first|duty=blocking|tools=cursor|actions=create_spec'];
  const merged = mergeLedgerExecutionRowPayload(
    {
      ok: true,
      mode: 'harness_dispatch',
      dispatch_id: 'harness_art_only',
      persona_contract_runtime_snapshot: snap,
    },
    { threadKey: tk2 },
    process.env,
  );
  await appendExecutionArtifact(tk2, {
    type: 'harness_dispatch',
    summary: 'harness_art_only',
    status: 'accepted',
    needs_review: false,
    payload: merged,
  });
  const ctx2 = await handleReadExecutionContext({ limit: 5 }, tk2);
  assert.deepEqual(ctx2.persona_contract_snapshot_lines, snap);
  assert.equal(ctx2.persona_contract_snapshot_source, 'recent_artifact_scan');
  await clearExecutionArtifacts(tk2);
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

console.log('test-persona-contract-read-context-snapshot-w2a-closeout: ok');
