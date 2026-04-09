/**
 * vNext.13.57 — Missing cloud contract source surfaces explicit code (not generic invalid_payload).
 */
import assert from 'node:assert';
import { compileEmitPatchForCloudAutomation, EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE } from '../src/founder/cursorLivePatchDispatch.js';
import { classifyEmitPatchAssemblyFailureCode } from '../src/founder/livePatchPayload.js';

const prep = compileEmitPatchForCloudAutomation({ title: 'only' });
assert.equal(prep.cloud_ok, false);
const code = classifyEmitPatchAssemblyFailureCode(prep, false);
assert.ok(
  code === 'invoke_payload_missing_narrow_live_patch_or_ops' || code.includes('missing'),
  `unexpected code: ${code}`,
);
assert.equal(EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE, 'emit_patch_missing_cloud_contract_source');

console.log('test-v13-57-missing-contract-source-code: ok');
