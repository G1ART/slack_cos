import assert from 'node:assert';
import { normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';

const body = {
  noise: { id: 'wrong' },
  custom: { path: { runId: 'from-override', phase: 'completed' } },
};

const env = {
  CURSOR_WEBHOOK_RUN_ID_PATH: 'custom.path.runId',
  CURSOR_WEBHOOK_STATUS_PATH: 'custom.path.phase',
};

const n = normalizeCursorWebhookPayload(body, env);
assert.ok(n);
assert.equal(n.canonical.external_run_id, 'from-override');
assert.equal(n.canonical.status_hint, 'external_completed');
assert.ok(n.evidence.selected_override_keys.includes('CURSOR_WEBHOOK_RUN_ID_PATH'));
assert.ok(n.evidence.selected_override_keys.includes('CURSOR_WEBHOOK_STATUS_PATH'));
assert.equal(n.evidence.source_run_id_field_name, 'CURSOR_WEBHOOK_RUN_ID_PATH');

const noOverride = normalizeCursorWebhookPayload(
  { type: 'statusChange', runId: 'flat-id', status: 'running' },
  {},
);
assert.ok(noOverride);
assert.equal(noOverride.canonical.external_run_id, 'flat-id');
assert.equal(noOverride.evidence.selected_override_keys.length, 0);

console.log('test-cursor-webhook-path-overrides: ok');
