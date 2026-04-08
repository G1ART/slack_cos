/**
 * vNext.13.53 — Callback absence after timeout: distinguish contract-present vs contract-absent.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { appendCosRunEventForRun, listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { maybeRecordOpsSmokeCursorCallbackAbsence, __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runCase(contractPresent) {
  process.env.COS_RUNTIME_STATE_DIR = path.join(
    __dirname,
    '..',
    '.runtime',
    contractPresent ? 'test-cb-abs-with' : 'test-cb-abs-without',
  );
  process.env.COS_RUN_STORE = 'memory';
  process.env.COS_OPS_SMOKE_ENABLED = '1';
  process.env.COS_CURSOR_CALLBACK_ABSENCE_TIMEOUT_SEC = '1';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __resetCosRunMemoryStore();
  __resetCosRunEventsMemoryForTests();
  __resetOpsSmokeSessionCacheForTests();

  const tk = contractPresent ? 'mention:cb:with:1' : 'mention:cb:without:1';
  const run = await persistRunAfterDelegate({
    threadKey: tk,
    dispatch: {
      ok: true,
      status: 'accepted',
      dispatch_id: 'd_cc',
      objective: 'o',
      packets: [
        {
          packet_id: 'p_cc',
          packet_status: 'ready',
          preferred_tool: 'cursor',
          preferred_action: 'emit_patch',
          mission: 'm',
        },
      ],
    },
    starter_kickoff: { executed: false },
    founder_request_summary: '',
  });
  const rid = String(run.id);
  const oldAt = new Date(Date.now() - 120_000).toISOString();
  await appendCosRunEventForRun(
    rid,
    'ops_smoke_phase',
    {
      smoke_session_id: 'sess_cc',
      phase: 'trigger_accepted_callback_pending',
      at: oldAt,
      thread_key: tk,
      callback_contract_present: contractPresent,
    },
    {},
  );
  await maybeRecordOpsSmokeCursorCallbackAbsence({ runId: rid, threadKey: tk, env: process.env });
  const evs = await listCosRunEventsForRun(rid, 50);
  const phases = evs.filter((e) => e.event_type === 'ops_smoke_phase').map((e) => e.payload?.phase);
  if (contractPresent) {
    assert.ok(phases.includes('cursor_callback_absent_despite_callback_contract'));
  } else {
    assert.ok(phases.includes('cursor_callback_absent_without_callback_contract'));
  }
  delete process.env.COS_OPS_SMOKE_ENABLED;
  delete process.env.COS_CURSOR_CALLBACK_ABSENCE_TIMEOUT_SEC;
  delete process.env.COS_RUN_STORE;
}

await runCase(true);
await runCase(false);

console.log('test-accepted-run-distinguishes-no-callback-with-vs-without-callback-contract: ok');
