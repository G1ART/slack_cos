/**
 * W2-B — accepted harness dispatch carries workcell; active run shell exposes summary + runtime (백필 포함).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  __resetCosRunMemoryStore,
  persistAcceptedRunShell,
  getActiveRunForThread,
  activeRunShellForCosExecutionContext,
} from '../src/founder/executionRunStore.js';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { formatHarnessWorkcellSummaryLines } from '../src/founder/harnessWorkcellRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;
const savedWs = process.env.COS_WORKSPACE_KEY;
const savedProd = process.env.COS_PRODUCT_KEY;
const savedPs = process.env.COS_PROJECT_SPACE_KEY;
const savedParcel = process.env.COS_PARCEL_DEPLOYMENT_KEY;

try {
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w2b-active-shell');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.COS_WORKSPACE_KEY = 'w2b_shell_ws';
  process.env.COS_PRODUCT_KEY = 'w2b_shell_prod';
  process.env.COS_PROJECT_SPACE_KEY = 'w2b_shell_ps';
  process.env.COS_PARCEL_DEPLOYMENT_KEY = 'w2b_shell_parcel';
  __resetCosRunMemoryStore();

  const tk = `dm:w2b-shell-${Date.now()}`;
  const h = await runHarnessOrchestration(
    {
      objective: 'persist workcell',
      personas: ['pm'],
      tasks: ['t'],
      deliverables: ['d'],
      constraints: [],
    },
    { threadKey: tk },
  );
  assert.equal(h.ok, true);
  assert.ok(h.workcell_runtime && typeof h.workcell_runtime === 'object');
  assert.ok(Array.isArray(h.workcell_summary_lines) && h.workcell_summary_lines.length >= 1);
  assert.ok(Array.isArray(h.persona_contract_runtime_snapshot) && h.persona_contract_runtime_snapshot.length >= 1);

  await persistAcceptedRunShell({ threadKey: tk, dispatch: h, founder_request_summary: 'w2b' });
  const active = await getActiveRunForThread(tk);
  assert.ok(active);
  const shell = activeRunShellForCosExecutionContext(active);
  assert.ok(shell);
  assert.ok(Array.isArray(shell.workcell_summary_lines) && shell.workcell_summary_lines.length >= 1);
  assert.ok(shell.workcell_runtime && shell.workcell_runtime.dispatch_id === h.dispatch_id);
  assert.ok(Array.isArray(shell.persona_contract_runtime_snapshot));

  const tk2 = `dm:w2b-shell-backfill-${Date.now()}`;
  const h2 = await runHarnessOrchestration(
    {
      objective: 'backfill summary from runtime only',
      personas: ['pm'],
      tasks: ['t'],
      deliverables: ['d'],
      constraints: [],
    },
    { threadKey: tk2 },
  );
  assert.equal(h2.ok, true);
  const dp = { ...h2 };
  delete dp.workcell_summary_lines;
  await persistAcceptedRunShell({ threadKey: tk2, dispatch: dp, founder_request_summary: 'w2b-backfill' });
  const active2 = await getActiveRunForThread(tk2);
  const shell2 = activeRunShellForCosExecutionContext(active2);
  assert.ok(shell2 && shell2.workcell_runtime);
  const expected = formatHarnessWorkcellSummaryLines(
    /** @type {Record<string, unknown>} */ (shell2.workcell_runtime),
    8,
  );
  assert.deepEqual(shell2.workcell_summary_lines, expected);
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

console.log('test-harness-workcell-runtime-active-run-shell: ok');
