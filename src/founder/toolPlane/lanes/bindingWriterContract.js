/**
 * W8-C — common binding-writer contract.
 *
 * 모든 live binding writer 는 아래 두 가지 **불변조건**을 만족해야 한다:
 *   (1) WriterInput 으로 secret value 를 받지 않는다. binding_name + (sink side) identifier 만 받는다.
 *   (2) `COS_LIVE_BINDING_WRITERS === '1'` 이 아니면, 절대 외부 API 에 write 하지 않는다.
 *       이 때는 smoke/fixture 결과를 반환하거나 'none' 으로 표기한다.
 *
 * 이 모듈은 결과 객체 빌더(`buildSmokeResult` / `buildLiveResult` / `buildFailureResult`)만 제공하고,
 * live API 호출은 개별 writer 가 책임진다.
 */

/** @typedef {'plain_readable'|'write_only'|'smoke_only'} SecretHandlingMode */

export const LIVE_BINDING_WRITERS_FLAG = 'COS_LIVE_BINDING_WRITERS';

export function liveBindingWritersEnabled(env = process.env) {
  const e = env || process.env;
  return String(e[LIVE_BINDING_WRITERS_FLAG] || '').trim() === '1';
}

export function assertNoSecretValueInWriterInput(req) {
  if (!req || typeof req !== 'object') return;
  const banned = ['secret_value', 'value', 'secret', 'token_value'];
  for (const k of banned) {
    if (Object.prototype.hasOwnProperty.call(req, k)) {
      throw new Error(`binding writer rejected: input must not carry raw '${k}'`);
    }
  }
}

export function buildSmokeResult({ secret_handling_mode, reason }) {
  return {
    wrote_at: null,
    sink_ref: null,
    secret_handling_mode: secret_handling_mode || 'smoke_only',
    verification_kind: 'smoke',
    verification_result: 'ok',
    live: false,
    failure_resolution_class: null,
    reason: reason || 'smoke_only (COS_LIVE_BINDING_WRITERS != 1)',
  };
}

export function buildLiveResult({
  secret_handling_mode,
  sink_ref,
  verification_kind,
  verification_result,
  wrote_at,
  write_only_reminder,
  requires_redeploy_to_apply,
}) {
  /** @type {Record<string, unknown>} */
  const out = {
    wrote_at: wrote_at || new Date().toISOString(),
    sink_ref: sink_ref || null,
    secret_handling_mode: secret_handling_mode || 'write_only',
    verification_kind: verification_kind || 'read_back',
    verification_result: verification_result || 'ok',
    live: true,
    failure_resolution_class: null,
  };
  if (write_only_reminder === true) out.write_only_reminder = true;
  if (requires_redeploy_to_apply === true) out.requires_redeploy_to_apply = true;
  return out;
}

export function buildFailureResult({ secret_handling_mode, failure_resolution_class, verification_kind }) {
  return {
    wrote_at: null,
    sink_ref: null,
    secret_handling_mode: secret_handling_mode || 'write_only',
    verification_kind: verification_kind || 'smoke',
    verification_result: 'failed',
    live: false,
    failure_resolution_class: failure_resolution_class || 'tool_adapter_unavailable',
  };
}
