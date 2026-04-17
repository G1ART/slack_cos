/**
 * W13-A1 — GitHub Actions repository secrets write client.
 *
 * 공식 API 경로:
 *   GET  /repos/{owner}/{repo}/actions/secrets/public-key   — repo public key
 *   PUT  /repos/{owner}/{repo}/actions/secrets/{name}       — create/update secret
 *   GET  /repos/{owner}/{repo}/actions/secrets/{name}       — metadata (존재/updated_at), 값 read-back 불가
 *
 * libsodium-wrappers 의 `crypto_box_seal` 로 repo public key 에 대해 payload 를 암호화한다.
 *
 * 이 모듈은 raw secret value 를 **JSON / log / 반환값** 어디에도 기록하지 않는다.
 * 호출자가 이미 소유한 `plainValue` 는 인자로만 주어지고, 암호화 base64 결과로만 빠져나간다.
 */

import { createRequire } from 'node:module';

// W13-A1: libsodium-wrappers 0.7.16 의 ESM 엔트리가 깨져 있어(./libsodium.mjs 경로 미존재), CJS 경로로 로드.
const require = createRequire(import.meta.url);
/** @type {any} */
const sodium = require('libsodium-wrappers');

const GITHUB_API_BASE = 'https://api.github.com';

function buildHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function splitRepoFull(repoFull) {
  const s = String(repoFull || '').trim();
  if (!s || !s.includes('/')) return null;
  const [owner, repo] = s.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * @param {{ repoFull: string, token: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: true, key: string, key_id: string, status: number } | { ok: false, status: number }>}
 */
export async function getRepositoryPublicKey({ repoFull, token, fetchImpl }) {
  const pair = splitRepoFull(repoFull);
  if (!pair) return { ok: false, status: 0 };
  const fx = fetchImpl || fetch;
  const res = await fx(
    `${GITHUB_API_BASE}/repos/${pair.owner}/${pair.repo}/actions/secrets/public-key`,
    { method: 'GET', headers: buildHeaders(token) },
  );
  if (res.status !== 200) return { ok: false, status: res.status };
  const body = await res.json();
  if (!body || typeof body !== 'object' || typeof body.key !== 'string' || typeof body.key_id !== 'string') {
    return { ok: false, status: res.status };
  }
  return { ok: true, key: body.key, key_id: body.key_id, status: res.status };
}

/**
 * Encrypt plain secret value with repo public key via libsodium `crypto_box_seal`.
 * @param {{ publicKeyBase64: string, plainValue: string }} args
 * @returns {Promise<string>} base64-encoded ciphertext
 */
export async function encryptSecretForRepoPublicKey({ publicKeyBase64, plainValue }) {
  await sodium.ready;
  const keyBytes = sodium.from_base64(String(publicKeyBase64 || ''), sodium.base64_variants.ORIGINAL);
  const valueBytes = sodium.from_string(String(plainValue == null ? '' : plainValue));
  const sealed = sodium.crypto_box_seal(valueBytes, keyBytes);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

/**
 * PUT repository Actions secret.
 * @param {{ repoFull: string, token: string, name: string, encryptedValueBase64: string, keyId: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
export async function putRepositorySecret({ repoFull, token, name, encryptedValueBase64, keyId, fetchImpl }) {
  const pair = splitRepoFull(repoFull);
  if (!pair) return { ok: false, status: 0 };
  const fx = fetchImpl || fetch;
  const res = await fx(
    `${GITHUB_API_BASE}/repos/${pair.owner}/${pair.repo}/actions/secrets/${encodeURIComponent(String(name || ''))}`,
    {
      method: 'PUT',
      headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_value: String(encryptedValueBase64 || ''), key_id: String(keyId || '') }),
    },
  );
  return { ok: res.status === 201 || res.status === 204, status: res.status };
}

/**
 * GET secret metadata (existence_only verification). 값은 돌려받지 못한다.
 * @param {{ repoFull: string, token: string, name: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: boolean, status: number, exists?: boolean }>}
 */
export async function getRepositorySecretMetadata({ repoFull, token, name, fetchImpl }) {
  const pair = splitRepoFull(repoFull);
  if (!pair) return { ok: false, status: 0 };
  const fx = fetchImpl || fetch;
  const res = await fx(
    `${GITHUB_API_BASE}/repos/${pair.owner}/${pair.repo}/actions/secrets/${encodeURIComponent(String(name || ''))}`,
    { method: 'GET', headers: buildHeaders(token) },
  );
  if (res.status === 200) return { ok: true, status: res.status, exists: true };
  if (res.status === 404) return { ok: true, status: res.status, exists: false };
  return { ok: false, status: res.status };
}

export default {
  getRepositoryPublicKey,
  encryptSecretForRepoPublicKey,
  putRepositorySecret,
  getRepositorySecretMetadata,
};
