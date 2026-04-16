/**
 * W8-C — Supabase binding writer.
 *
 * Supabase 는 콘솔에서만 secret 을 넣을 수 있는 케이스가 많으므로 대개 smoke_only 이다.
 * 이 writer 는 project ref (sink_ref) 와 SUPABASE_SERVICE_ROLE_KEY 가 있을 때 REST ping 으로
 * 연결성을 smoke 한다. secret value 는 받지 않는다.
 */

import {
  assertNoSecretValueInWriterInput,
  buildSmokeResult,
  buildLiveResult,
  buildFailureResult,
  liveBindingWritersEnabled,
} from '../bindingWriterContract.js';

export async function write(req, opts = {}) {
  assertNoSecretValueInWriterInput(req);
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const name = String(req?.binding_name || '').trim();
  const mode = req?.secret_handling_mode || 'smoke_only';

  if (!liveBindingWritersEnabled(env) || mode !== 'smoke_only') {
    return buildSmokeResult({
      secret_handling_mode: mode,
      reason:
        mode !== 'smoke_only'
          ? 'supabase writer is smoke_only by design (no live secret write)'
          : 'COS_LIVE_BINDING_WRITERS != 1 → smoke',
    });
  }

  const projectUrl = String(req?.sink_ref || env.SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!projectUrl || !serviceKey) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'binding_missing',
      verification_kind: 'smoke',
    });
  }

  try {
    const pingUrl = projectUrl.replace(/\/$/, '') + '/rest/v1/';
    const res = await fetchImpl(pingUrl, {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok && res.status !== 404) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'tool_adapter_unavailable',
        verification_kind: 'smoke',
      });
    }
    return buildLiveResult({
      secret_handling_mode: mode,
      sink_ref: projectUrl,
      verification_kind: 'smoke',
      verification_result: 'ok',
    });
  } catch (_err) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'tool_adapter_unavailable',
      verification_kind: 'smoke',
    });
  }
}

export default { write };
