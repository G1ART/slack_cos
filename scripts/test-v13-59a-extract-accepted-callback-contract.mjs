/**
 * vNext.13.59a — extractLatestAcceptedAttemptCallbackContractFromRows prefers cursor_trigger_recorded proof.
 */
import assert from 'node:assert';
import { extractLatestAcceptedAttemptCallbackContractFromRows } from '../src/founder/smokeOps.js';

const rows = [
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T09:00:00Z',
    payload: {
      smoke_session_id: 's',
      phase: 'trigger_outbound_callback_contract',
      at: '2026-04-09T09:00:00Z',
      callback_contract_present: false,
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T10:00:00Z',
    payload: {
      phase: 'cursor_trigger_recorded',
      at: '2026-04-09T10:00:00Z',
      trigger_ok: true,
      outbound_callback_contract_present: true,
      outbound_callback_contract_reason: 'enabled_and_inserted',
      outbound_callback_url_path_only: '/webhooks/cursor',
      outbound_callback_field_names: ['callbackUrl', 'webhookSecret'],
      callback_url_field_name: 'callbackUrl',
      callback_secret_field_name: 'webhookSecret',
      callback_secret_present: true,
    },
  },
];

const x = extractLatestAcceptedAttemptCallbackContractFromRows(rows);
assert.ok(x);
assert.equal(x.callback_contract_present, true);
assert.equal(x.outbound_callback_contract_reason, 'enabled_and_inserted');

console.log('test-v13-59a-extract-accepted-callback-contract: ok');
