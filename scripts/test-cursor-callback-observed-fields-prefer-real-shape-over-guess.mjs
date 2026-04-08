import assert from 'node:assert';
import { peekCursorWebhookObservedSchemaSnapshot } from '../src/founder/cursorWebhookIngress.js';

const env = {
  ...process.env,
  CURSOR_WEBHOOK_RUN_ID_PATH: 'nested.customRun.id',
};
const body = {
  runId: 'would_be_heuristic_default',
  nested: { customRun: { id: 'from_env_path_only' } },
  status: 'ok',
};

const snap = peekCursorWebhookObservedSchemaSnapshot(body, env);
assert.equal(snap.observed_run_id_field, 'CURSOR_WEBHOOK_RUN_ID_PATH');
assert.equal(snap.run_id_candidate_tail, 'ath_only');

delete process.env.CURSOR_WEBHOOK_RUN_ID_PATH;

console.log('test-cursor-callback-observed-fields-prefer-real-shape-over-guess: ok');
