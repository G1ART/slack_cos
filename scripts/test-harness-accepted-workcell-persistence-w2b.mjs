/**
 * W2-B: accepted harness dispatch carries workcell; active run shell exposes it.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;

try {
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w2b-persist');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __resetCosRunMemoryStore();

  const tk = `dm:w2b-persist-${Date.now()}`;
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
} finally {
  if (savedDir === undefined) delete process.env.COS_RUNTIME_STATE_DIR;
  else process.env.COS_RUNTIME_STATE_DIR = savedDir;
  if (savedStore === undefined) delete process.env.COS_RUN_STORE;
  else process.env.COS_RUN_STORE = savedStore;
}

console.log('test-harness-accepted-workcell-persistence-w2b: ok');
