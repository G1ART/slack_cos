/**
 * W13-A — bindingWriterContract 의 buildLiveResult 가 write_only_reminder / requires_redeploy_to_apply
 * 를 포함한 리포트를 반환할 수 있어야 한다. 실제 live 경로(github PUT, vercel POST/PATCH) 는
 * 각 writer 테스트에서 end-to-end 로 확인하고, 여기서는 builder 레벨 보증만.
 */
import assert from 'node:assert/strict';
import { buildLiveResult } from '../src/founder/toolPlane/lanes/bindingWriterContract.js';

{
  const r = buildLiveResult({
    secret_handling_mode: 'write_only',
    sink_ref: 'owner/repo',
    verification_kind: 'existence_only',
    verification_result: 'ok',
    write_only_reminder: true,
  });
  assert.equal(r.live, true);
  assert.equal(r.write_only_reminder, true);
  assert.equal(r.requires_redeploy_to_apply, undefined, 'not set when not passed');
}

{
  const r = buildLiveResult({
    secret_handling_mode: 'write_only',
    sink_ref: 'prj_1',
    verification_kind: 'existence_only',
    verification_result: 'ok',
    write_only_reminder: true,
    requires_redeploy_to_apply: true,
  });
  assert.equal(r.write_only_reminder, true);
  assert.equal(r.requires_redeploy_to_apply, true);
}

{
  const r = buildLiveResult({
    secret_handling_mode: 'write_only',
    sink_ref: 'owner/repo',
    verification_kind: 'existence_only',
    verification_result: 'ok',
    write_only_reminder: false,
    requires_redeploy_to_apply: false,
  });
  assert.equal(r.write_only_reminder, undefined);
  assert.equal(r.requires_redeploy_to_apply, undefined);
}

console.log('test-bindingwriter-result-includes-write-only-reminder-and-requires-redeploy: ok');
