/**
 * vNext.13.59a — deriveOutboundCallbackContractReason enum matches env truth.
 */
import assert from 'node:assert';
import {
  deriveOutboundCallbackContractReason,
  describeTriggerCallbackContractForOps,
} from '../src/founder/cursorCloudAdapter.js';

const d0 = deriveOutboundCallbackContractReason({
  CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED: '0',
  PUBLIC_BASE_URL: 'https://x.example',
  CURSOR_WEBHOOK_SECRET: 's',
});
assert.equal(d0, 'disabled_by_env');

const d1 = deriveOutboundCallbackContractReason({
  CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED: '1',
  PUBLIC_BASE_URL: '',
  CURSOR_AUTOMATION_CALLBACK_URL: '',
  CURSOR_WEBHOOK_SECRET: 'sec',
});
assert.equal(d1, 'callback_url_unavailable');

const d2 = deriveOutboundCallbackContractReason({
  CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED: '1',
  PUBLIC_BASE_URL: 'https://h.example',
  CURSOR_AUTOMATION_CALLBACK_PATH: '/webhooks/cursor',
  CURSOR_WEBHOOK_SECRET: '',
});
assert.equal(d2, 'callback_secret_unavailable');

const okEnv = {
  CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED: '1',
  PUBLIC_BASE_URL: 'https://h.example',
  CURSOR_AUTOMATION_CALLBACK_PATH: '/webhooks/cursor',
  CURSOR_WEBHOOK_SECRET: 'whsec_ok',
};
assert.equal(deriveOutboundCallbackContractReason(okEnv), 'enabled_and_inserted');
assert.equal(describeTriggerCallbackContractForOps(okEnv).callback_contract_present, true);

console.log('test-v13-59a-callback-contract-reason: ok');
