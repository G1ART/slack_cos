import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getRunById,
  listPendingSupervisorWakeRunIds,
  signalSupervisorWakeForRun,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { tickRunSupervisorForRun } from '../src/founder/runSupervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(__dirname, '..', '.runtime', 'test-restart-wake');
process.env.COS_RUNTIME_STATE_DIR = runtimeDir;
process.env.COS_RUN_STORE = 'file';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

await fs.rm(runtimeDir, { recursive: true, force: true });
await fs.mkdir(runtimeDir, { recursive: true });
__resetCosRunMemoryStore();

const client = {
  chat: {
    postMessage: async () => ({ ok: true }),
  },
};

const tk = 'mention:vnext40_restart_wake:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_rw',
    objective: 'rw',
    packets: [
      {
        packet_id: 'p_rw',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid = String(run.id);
assert.ok(rid);

await signalSupervisorWakeForRun(tk, rid);

__resetCosRunMemoryStore();

const pending = await listPendingSupervisorWakeRunIds(20);
assert.ok(pending.includes(rid), 'pending_supervisor_wake must be visible from disk after memory reset (restart analog)');

await tickRunSupervisorForRun(rid, { client, constitutionSha256: 'test', skipLease: true });

const after = await getRunById(rid);
assert.equal(after?.pending_supervisor_wake, false, 'supervisor tick must clear durable wake marker');

console.log('test-process-restart-does-not-lose-run-scoped-wake: ok');
