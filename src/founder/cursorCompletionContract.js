/**
 * vNext.13.71 — Machine-readable emit_patch completion contract for Cursor Cloud outbound trigger.
 * No secrets in this block; URL is path-hint only. Actual URL/secret remain in mergeCallbackContractIntoTriggerBody fields.
 */

import { listNormalizedEmitPatchPathsForAnchor } from './cursorCallbackGate.js';

/** Top-level key on automation POST body when action is emit_patch and callback contract is present. */
export const EMIT_PATCH_COMPLETION_CONTRACT_KEY = 'cos_emit_patch_completion_contract_v1';

/**
 * @param {{
 *   callbackDescribe: Record<string, unknown> & { callback_contract_present?: boolean, callback_url_field_name?: string, callback_secret_field_name?: string },
 *   fullCallbackUrl: string,
 *   requestId: string,
 *   payload: Record<string, unknown>,
 * }} p
 * @returns {Record<string, unknown> | null}
 */
export function buildEmitPatchCompletionContractBlock(p) {
  const d = p.callbackDescribe;
  if (!d || d.callback_contract_present !== true) return null;
  const url = String(p.fullCallbackUrl || '').trim();
  if (!url) return null;

  let callbackUrlPathHint = '';
  try {
    callbackUrlPathHint = new URL(url).pathname;
  } catch {
    callbackUrlPathHint = '';
  }

  const pl = p.payload && typeof p.payload === 'object' && !Array.isArray(p.payload) ? p.payload : {};
  const pathsTouchedExpected = listNormalizedEmitPatchPathsForAnchor(pl).slice(0, 48);
  const rid = String(p.requestId || '').trim();

  return {
    version: 1,
    contract_name: 'cos_emit_patch_completion_v1',
    expected_primary_closure: 'signed_webhook_post',
    callback_url_path_hint: callbackUrlPathHint || null,
    trigger_callback_url_field_name: d.callback_url_field_name,
    trigger_callback_secret_field_name: d.callback_secret_field_name,
    signing: {
      header_name: 'x-cursor-signature-256',
      algorithm: 'hmac_sha256',
      message: 'raw_utf8_json_body_bytes',
      secret_env: 'CURSOR_WEBHOOK_SECRET',
      digest_prefix: 'sha256=',
    },
    minimum_callback_body_fields: [
      'status',
      'request_id',
      'paths_touched',
      'backgroundComposerId',
      'summary',
      'occurred_at',
    ],
    expected_cos_callback_closure_source_primary: 'provider_runtime',
    secondary_effects_policy:
      'Git branch, push, and PR are secondary; they do not satisfy completion without a signed COS webhook callback (or documented callback-unavailable path).',
    paths_touched_expected: pathsTouchedExpected,
    request_id_for_correlation: rid || null,
    machine_rule_no_signed_callback_no_complete: true,
    provider_instructions_ko:
      '패치 적용(에이전트 수락)만으로 완료로 보지 말 것. 동일 request_id·paths_touched·backgroundComposerId로 HMAC 서명된 JSON 본문을 콜백 URL로 POST하십시오. 리플렉션/푸시만으로 1차 완료로 취급하지 마십시오.',
  };
}
