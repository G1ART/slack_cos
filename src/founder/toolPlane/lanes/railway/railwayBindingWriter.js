/**
 * W8-C — Railway binding writer. GraphQL variables 존재 smoke 만.
 * live 는 COS_LIVE_BINDING_WRITERS=1 + RAILWAY_TOKEN + sink_ref(serviceId/environmentId) 필요.
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

  if (!liveBindingWritersEnabled(env) || mode === 'smoke_only' || !name) {
    return buildSmokeResult({
      secret_handling_mode: mode,
      reason: !name
        ? 'binding_name missing → smoke only'
        : mode === 'smoke_only'
          ? 'secret_handling_mode=smoke_only → smoke'
          : 'COS_LIVE_BINDING_WRITERS != 1 → smoke',
    });
  }

  const token = String(env.RAILWAY_TOKEN || '').trim();
  const sinkRef = String(req?.sink_ref || '').trim();
  const projectId = String(env.RAILWAY_PROJECT_ID || '').trim();
  if (!token || !projectId) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'binding_missing',
    });
  }

  try {
    const res = await fetchImpl('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `query variables($projectId: String!) { variables(projectId: $projectId) }`,
        variables: { projectId },
      }),
    });
    if (!res.ok) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'tool_adapter_unavailable',
        verification_kind: 'smoke',
      });
    }
    const body = await res.json().catch(() => null);
    const vars = body?.data?.variables || {};
    const found = Object.prototype.hasOwnProperty.call(vars, name);
    if (!found) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'binding_missing',
        verification_kind: 'read_back',
      });
    }
    return buildLiveResult({
      secret_handling_mode: mode,
      sink_ref: sinkRef || projectId,
      verification_kind: 'read_back',
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
