import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveRunStatusFromKickoff } from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-lifecycle');

assert.equal(deriveRunStatusFromKickoff(null), 'queued');
assert.equal(deriveRunStatusFromKickoff({ executed: false }), 'queued');
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { status: 'blocked' } }),
  'blocked',
);
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { blocked: true, reason: 'x' } }),
  'blocked',
);
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { reason: 'unsupported_tool' } }),
  'blocked',
);
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { status: 'failed' } }),
  'failed',
);
assert.equal(
  deriveRunStatusFromKickoff({
    executed: true,
    outcome: { status: 'degraded', needs_review: true },
  }),
  'review_required',
);
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { status: 'completed' } }),
  'completed',
);
assert.equal(
  deriveRunStatusFromKickoff({ executed: true, outcome: { status: 'pending' } }),
  'running',
);

console.log('test-run-lifecycle-transitions: ok');
