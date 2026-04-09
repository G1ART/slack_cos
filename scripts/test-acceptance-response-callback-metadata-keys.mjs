/**
 * vNext.13.56 — acceptanceResponseHasCallbackMetadataKeys is independent of outbound contract attachment.
 */
import assert from 'node:assert';
import { acceptanceResponseHasCallbackMetadataKeys } from '../src/founder/cursorCloudAdapter.js';

process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '0';
const trNoEcho = { response_top_level_keys: ['id', 'status'] };
assert.equal(acceptanceResponseHasCallbackMetadataKeys(trNoEcho), false);

process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_CALLBACK_URL = 'https://example.com/hooks/cursor';
process.env.CURSOR_WEBHOOK_SECRET = 'secret';
process.env.PUBLIC_BASE_URL = '';
process.env.CURSOR_AUTOMATION_CALLBACK_URL_FIELD = 'callbackUrl';
const trEcho = { response_top_level_keys: ['callbackUrl', 'runId'] };
assert.equal(acceptanceResponseHasCallbackMetadataKeys(trEcho), true);

console.log('test-acceptance-response-callback-metadata-keys: ok');
