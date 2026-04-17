/**
 * W13-A1 — GitHub binding writer.
 *
 * 본 에픽에서 GitHub Actions repository secrets 의 **실제 live write** 를 공식 지원한다.
 *
 *   plain_readable  — GitHub 은 값 read-back 을 지원하지 않으므로 결과는 existence_only 로 강등된다.
 *   write_only      — libsodium encrypt → PUT → existence_only verification
 *   smoke_only      — 항상 smoke 만
 *
 * live 외부 write 는 반드시 `COS_LIVE_BINDING_WRITERS=1` + GITHUB_TOKEN 조건이 맞아야 수행하고,
 * 값(raw secret) 은 `WriterInput` 으로 절대 들어오지 않는다 (contract). writer 는 `env[binding_name]`
 * 에서 값을 직접 읽고, 그 즉시 libsodium 으로 encrypt 한 base64 만 외부에 내보낸다.
 *
 * 실패 분류:
 *   401/403  → external_auth_gate
 *   404      → sink_target_missing (public key 없음 포함)
 *   422      → technical_capability_missing (encrypt 실패 등)
 *   기타     → tool_adapter_unavailable
 */

import {
  assertNoSecretValueInWriterInput,
  buildSmokeResult,
  buildLiveResult,
  buildFailureResult,
  liveBindingWritersEnabled,
} from '../bindingWriterContract.js';
import {
  getRepositoryPublicKey,
  encryptSecretForRepoPublicKey,
  putRepositorySecret,
  getRepositorySecretMetadata,
} from './githubSecretsWriteClient.js';

function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return 'external_auth_gate';
  if (status === 404) return 'sink_target_missing';
  if (status === 422) return 'technical_capability_missing';
  return 'tool_adapter_unavailable';
}

/** @param {import('../../../envSecretPropagationEngine.js').WriterInput & { sink_ref?: string }} req
 *  @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [opts]
 */
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

  const token = String(env.GITHUB_TOKEN || '').trim();
  const repoFull = String(req?.sink_ref || env.GITHUB_DEFAULT_BINDING_REPO || '').trim();
  if (!token || !repoFull || !repoFull.includes('/')) {
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

  try {
    const pkRes = await getRepositoryPublicKey({ repoFull, token, fetchImpl });
    if (!pkRes.ok) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: classifyHttpStatus(pkRes.status),
        verification_kind: 'existence_only',
      });
    }
    let encryptedValueBase64;
    try {
      encryptedValueBase64 = await encryptSecretForRepoPublicKey({
        publicKeyBase64: pkRes.key,
        plainValue,
      });
    } catch (_err) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'technical_capability_missing',
        verification_kind: 'existence_only',
      });
    }

    const putRes = await putRepositorySecret({
      repoFull,
      token,
      name,
      encryptedValueBase64,
      keyId: pkRes.key_id,
      fetchImpl,
    });
    if (!putRes.ok) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: classifyHttpStatus(putRes.status),
        verification_kind: 'existence_only',
      });
    }

    const meta = await getRepositorySecretMetadata({ repoFull, token, name, fetchImpl });
    if (!meta.ok || meta.exists !== true) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: meta.ok ? 'sink_target_missing' : classifyHttpStatus(meta.status),
        verification_kind: 'existence_only',
      });
    }

    return buildLiveResult({
      secret_handling_mode: mode,
      sink_ref: repoFull,
      verification_kind: 'existence_only',
      verification_result: 'ok',
      write_only_reminder: true,
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
