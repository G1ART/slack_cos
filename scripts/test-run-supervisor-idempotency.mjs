import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
} from '../src/founder/executionRunStore.js';
import { processRunMilestones } from '../src/founder/runSupervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-supervisor-idem');

const tk = 'mention:C_test_idem:1.0';
await saveSlackRouting(tk, { channel: 'C_test_idem', thread_ts: '1.0' });

const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'h_idem',
  objective: 'idem objective',
  packets: [{ packet_id: 'p1', persona: 'pm' }],
};

const kick = {
  executed: true,
  tool: 'cursor',
  action: 'create_spec',
  outcome: { status: 'completed' },
};

let posts = 0;
const client = {
  chat: {
    postMessage: async () => {
      posts += 1;
      return { ok: true };
    },
  },
};

const run0 = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: kick,
  founder_request_summary: '',
});

await processRunMilestones({ run: run0, client, constitutionSha256: 'abc' });
assert.equal(posts, 1, 'started milestone once');

const run1 = await getActiveRunForThread(tk);
await processRunMilestones({ run: run1, client, constitutionSha256: 'abc' });
assert.ok(posts >= 1);
if (run1.status === 'completed' && !run0.founder_notified_completed_at) {
  assert.equal(posts, 2, 'completed milestone after started');
}

const run2 = await getActiveRunForThread(tk);
const postsBefore = posts;
await processRunMilestones({ run: run2, client, constitutionSha256: 'abc' });
assert.equal(posts, postsBefore, 'no duplicate milestone after flags set');

console.log('test-run-supervisor-idempotency: ok');
