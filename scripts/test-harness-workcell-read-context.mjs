/**
 * W2-B — read_execution_context: shell 요약 우선, 그다음 workcell_runtime.summary_lines, workcell_status.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  __resetCosRunMemoryStore,
  persistAcceptedRunShell,
} from '../src/founder/executionRunStore.js';
import { handleReadExecutionContext } from '../src/founder/founderCosToolHandlers.js';
import { appendExecutionArtifact, clearExecutionArtifacts } from '../src/founder/executionLedger.js';
import { mergeLedgerExecutionRowPayload } from '../src/founder/canonicalExecutionEnvelope.js';
import { formatHarnessWorkcellSummaryLines } from '../src/founder/harnessWorkcellRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const savedDir = process.env.COS_RUNTIME_STATE_DIR;
const savedStore = process.env.COS_RUN_STORE;

try {
  process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-w2b-readctx');
  process.env.COS_RUN_STORE = 'memory';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __resetCosRunMemoryStore();

  const tk = `dm:w2b-read-${Date.now()}`;
  const stale = mergeLedgerExecutionRowPayload(
    {
      ok: true,
      mode: 'harness_dispatch',
      dispatch_id: 'harness_stale',
      workcell_summary_lines: ['workcell from ledger artifact only'],
    },
    { threadKey: tk },
    process.env,
  );
  await appendExecutionArtifact(tk, {
    type: 'harness_dispatch',
    summary: 'stale',
    status: 'accepted',
    needs_review: false,
    payload: stale,
  });

  const shellLines = ['workcell from active run shell'];
  /** @type {Record<string, unknown>} */
  const rtBase = {
    workcell_id: 'wc_harness_shell_win',
    dispatch_id: 'harness_shell_win',
    status: 'active',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      {
        packet_id: 'p1',
        persona: 'pm',
        owner_persona: 'pm',
        status: 'active',
        review_required: false,
        escalation_target: null,
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
      },
    ],
  };
  rtBase.summary_lines = formatHarnessWorkcellSummaryLines(rtBase, 8);
  const minimalRuntime = rtBase;
  const dispatch = {
    ok: true,
    status: 'accepted',
    dispatch_id: 'harness_shell_win',
    objective: 'shell priority',
    persona_contract_runtime_snapshot: ['pm|planner|v1'],
    workcell_summary_lines: shellLines,
    workcell_runtime: minimalRuntime,
    packets: [
      {
        packet_id: 'p1',
        persona: 'pm',
        mission: 'm',
        owner_persona: 'pm',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        packet_status: 'ready',
      },
    ],
    handoff_order: ['pm'],
  };
  await persistAcceptedRunShell({ threadKey: tk, dispatch, founder_request_summary: 'w2b-read' });

  const ctx = await handleReadExecutionContext({ limit: 8 }, tk);
  assert.ok(Array.isArray(ctx.workcell_summary_lines));
  assert.deepEqual(ctx.workcell_summary_lines, shellLines);
  assert.equal(ctx.workcell_status, 'active');

  await clearExecutionArtifacts(tk);
  __resetCosRunMemoryStore();
} finally {
  if (savedDir === undefined) delete process.env.COS_RUNTIME_STATE_DIR;
  else process.env.COS_RUNTIME_STATE_DIR = savedDir;
  if (savedStore === undefined) delete process.env.COS_RUN_STORE;
  else process.env.COS_RUN_STORE = savedStore;
}

console.log('test-harness-workcell-read-context: ok');
