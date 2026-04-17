/**
 * W13-A2 — Vercel binding writer.
 *
 * 본 에픽에서 Vercel Project Env Variables 의 **실제 live write (POST/PATCH)** 를 공식 지원한다.
 *
 *   plain_readable  — 적용 이후도 값 read-back 불가(암호화 env) → existence_only 로 강등
 *   write_only      — existence check → 없으면 POST, 있으면 PATCH → buildLiveResult existence_only
 *   smoke_only      — 항상 smoke 만
 *
 * `COS_LIVE_BINDING_WRITERS=1` + VERCEL_TOKEN + sink_ref(project id) 세 조건이 모두 갖춰져야 live 진행.
 * value 는 WriterInput 에 들어오지 않으므로 `env[binding_name]` 에서 읽는다. raw secret 값은 반환·로그 어디에도 저장하지 않는다.
 *
 * WriterResult 에 `requires_redeploy_to_apply:true` 를 붙여 "env 는 다음 deploy 부터 적용됨" 을 명시한다.
 */

import {
  assertNoSecretValueInWriterInput,
  buildSmokeResult,
  buildLiveResult,
  buildFailureResult,
  liveBindingWritersEnabled,
} from '../bindingWriterContract.js';
import { listEnv, createEnv, updateEnv } from './vercelEnvWriteClient.js';

function classifyStatus(status) {
  if (status === 401 || status === 403) return 'external_auth_gate';
  if (status === 404) return 'sink_target_missing';
  if (status === 409 || status === 422) return 'technical_capability_missing';
  return 'tool_adapter_unavailable';
}

export async function write(req, opts = {}) {
  assertNoSecretValueInWriterInput(req);
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const name = String(req?.binding_name || '').trim();
  const mode = req?.secret_handling_mode || 'smoke_only';
  const teamId = String(env.VERCEL_TEAM_ID || '').trim() || undefined;

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
      verification_kind: 'existence_only',
    });
  }

  const plainValue = env[name];
  if (typeof plainValue !== 'string' || plainValue.length === 0) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'binding_missing',
      verification_kind: 'existence_only',
    });
  }

  const target = Array.isArray(req?.target_vercel_env) && req.target_vercel_env.length > 0
    ? req.target_vercel_env.map(String)
    : ['production'];

  try {
    const list = await listEnv({ projectId, token, teamId, fetchImpl });
    if (!list.ok) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: classifyStatus(list.status),
        verification_kind: 'existence_only',
      });
    }
    const existing = Array.isArray(list.envs)
      ? list.envs.find((e) => String(e.key || '') === name)
      : null;

    if (existing && existing.id) {
      const patchRes = await updateEnv({
        projectId,
        token,
        teamId,
        envId: existing.id,
        value: plainValue,
        target,
        type: 'encrypted',
        fetchImpl,
      });
      if (!patchRes.ok) {
        return buildFailureResult({
          secret_handling_mode: mode,
          failure_resolution_class: classifyStatus(patchRes.status),
          verification_kind: 'existence_only',
        });
      }
    } else {
      const createRes = await createEnv({
        projectId,
        token,
        teamId,
        key: name,
        value: plainValue,
        target,
        type: 'encrypted',
        fetchImpl,
      });
      if (!createRes.ok) {
        return buildFailureResult({
          secret_handling_mode: mode,
          failure_resolution_class: classifyStatus(createRes.status),
          verification_kind: 'existence_only',
        });
      }
    }

    return buildLiveResult({
      secret_handling_mode: mode,
      sink_ref: projectId,
      verification_kind: 'existence_only',
      verification_result: 'ok',
      write_only_reminder: true,
      requires_redeploy_to_apply: true,
    });
  } catch (_err) {
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'tool_adapter_unavailable',
      verification_kind: 'existence_only',
    });
  }
}

export default { write };
