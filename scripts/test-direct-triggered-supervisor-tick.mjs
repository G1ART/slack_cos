import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRunStateChangeListener } from '../src/founder/supervisorDirectTrigger.js';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-direct-tick');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();

let notifies = 0;
registerRunStateChangeListener(() => {
  notifies += 1;
});

const tk = 'mention:C_direct:3.3';
await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_d',
    objective: 'direct',
    packets: [
      {
        packet_id: 'pd1',
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

await Promise.resolve();
await Promise.resolve();
assert.ok(notifies >= 1, 'persist should notify for direct supervisor scheduling');

registerRunStateChangeListener(null);

console.log('test-direct-triggered-supervisor-tick: ok');
