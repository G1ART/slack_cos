/**
 * W8-C — GitHub binding writer.
 *
 * 역할: propagation engine 에서 binding_requirement (ENV name · repo scope) 를
 * GitHub Actions secret 이름 존재로 검증/기록한다.
 *
 *   plain_readable  — binding_name 이 repo variable 에 존재하는지 smoke (read_back)
 *   write_only      — binding_name 을 Actions secret 로 "존재 표식" 하거나 smoke
 *   smoke_only      — 항상 smoke 만
 *
 * live 외부 write 는 반드시 `COS_LIVE_BINDING_WRITERS=1` + GITHUB_TOKEN 양쪽 조건이 맞아야 수행한다.
 * 그 외에는 smoke 결과를 반환한다. 이 writer 는 **secret value 를 받지 않는다**.
 */

import {
  assertNoSecretValueInWriterInput,
  buildSmokeResult,
  buildLiveResult,
  buildFailureResult,
  liveBindingWritersEnabled,
} from '../bindingWriterContract.js';

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
    });
  }

  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repoFull}/actions/secrets/${encodeURIComponent(name)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 200) {
      return buildLiveResult({
        secret_handling_mode: mode,
        sink_ref: repoFull,
        verification_kind: 'read_back',
        verification_result: 'ok',
      });
    }
    if (res.status === 404) {
      return buildFailureResult({
        secret_handling_mode: mode,
        failure_resolution_class: 'binding_missing',
        verification_kind: 'read_back',
      });
    }
    return buildFailureResult({
      secret_handling_mode: mode,
      failure_resolution_class: 'tool_adapter_unavailable',
      verification_kind: 'read_back',
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
