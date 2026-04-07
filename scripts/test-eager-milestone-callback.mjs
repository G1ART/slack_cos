import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEagerCombinedMilestone } from '../src/founder/founderCallbackCopy.js';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  patchRun,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { processRunMilestones } from '../src/founder/runSupervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-eager-milestone');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

const ec = renderEagerCombinedMilestone({
  objective: '테스트 목표',
  tool: 'cursor',
  action: 'create_spec',
  terminal: 'completed',
  summary_lines: ['줄1'],
});
assert.ok(ec.includes('첫 실행을 시작했고'));
assert.ok(ec.includes('cursor'));
assert.ok(ec.includes('create_spec'));
assert.ok(ec.includes('줄1'));

const eb = renderEagerCombinedMilestone({
  objective: '블록',
  tool: 'github',
  action: 'create_issue',
  terminal: 'blocked',
  need_line: '토큰 필요',
});
assert.ok(eb.includes('멈춥니다'));
assert.ok(eb.includes('토큰'));

const tk = 'mention:C_eager:2.0';
await saveSlackRouting(tk, { channel: 'C_eager', thread_ts: '2.0' });

const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'h_eager',
  objective: 'eager one shot',
  handoff_order: ['pm'],
  packets: [
    {
      persona: 'pm',
      packet_id: 'p_eager_1',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm',
      deliverables: [],
    },
  ],
};

const kick = {
  executed: true,
  tool: 'cursor',
  action: 'create_spec',
  packet_id: 'p_eager_1',
  outcome: { status: 'completed', ok: true },
};

await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: kick,
  founder_request_summary: '',
});

let posts = 0;
const client = {
  chat: {
    postMessage: async ({ text }) => {
      posts += 1;
      assert.ok(String(text).includes('첫 실행을 시작했고'), 'eager combined copy');
      return { ok: true };
    },
  },
};

const run0 = await getActiveRunForThread(tk);
await processRunMilestones({ run: run0, client, constitutionSha256: 'x' });
assert.equal(posts, 1);

const run1 = await getActiveRunForThread(tk);
assert.ok(run1.founder_notified_started_at);
assert.ok(run1.founder_notified_completed_at);

await processRunMilestones({ run: run1, client, constitutionSha256: 'x' });
assert.equal(posts, 1, 'idempotent after flags');

await patchRun(tk, {
  founder_notified_started_at: null,
  founder_notified_completed_at: null,
});
const runReset = await getActiveRunForThread(tk);
posts = 0;
await processRunMilestones({ run: runReset, client, constitutionSha256: 'x' });
assert.equal(posts, 1);

console.log('test-eager-milestone-callback: ok');
