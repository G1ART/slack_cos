/**
 * W8-C — Vercel binding writer. env/secret 이름 존재 검증만 수행한다.
 * live 는 COS_LIVE_BINDING_WRITERS=1 + VERCEL_TOKEN + sink_ref(project_id) 필요.
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

  const token = String(env.VERCEL_TOKEN || '').trim();
  const projectId = String(req?.sink_ref || env.VERCEL_DEFAULT_PROJECT_ID || '').trim();
  if (!token || !projectId) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'binding_missing',
    });
  }

  try {
    const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`);
    const team = String(env.VERCEL_TEAM_ID || '').trim();
    if (team) url.searchParams.set('teamId', team);
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class:
          res.status === 404 ? 'binding_missing' : 'tool_adapter_unavailable',
        verification_kind: 'read_back',
      });
    }
    const body = await res.json().catch(() => null);
    const envs = Array.isArray(body?.envs) ? body.envs : [];
    const found = envs.some((x) => String(x?.key || '').trim() === name);
    if (!found) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'binding_missing',
        verification_kind: 'read_back',
      });
    }
    return buildLiveResult({
      secret_handling_mode: mode,
      sink_ref: projectId,
      verification_kind: 'read_back',
      verification_result: 'ok',
    });
  } catch (_err) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'tool_adapter_unavailable',
      verification_kind: 'read_back',
    });
  }
}

export default { write };
