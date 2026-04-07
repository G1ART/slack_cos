/**
 * Thread 단위 execution evidence (visibility spine). tracked 경로 사용 금지.
 *
 * Artifact types: harness_dispatch | harness_packet | tool_invocation | tool_result | execution_note
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function baseDir() {
  const env = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

function ledgerDir() {
  return path.join(baseDir(), 'execution');
}

/** @param {string} threadKey */
function safeFileName(threadKey) {
  const b = Buffer.from(String(threadKey), 'utf8').toString('base64url');
  return `${b}.json`;
}

async function readAll(threadKey) {
  const fp = path.join(ledgerDir(), safeFileName(threadKey));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.artifacts) ? j.artifacts : [];
  } catch {
    return [];
  }
}

async function writeAll(threadKey, artifacts) {
  const dir = ledgerDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, safeFileName(threadKey));
  await fs.writeFile(fp, JSON.stringify({ artifacts }, null, 0), 'utf8');
}

/**
 * @param {string} threadKey
 * @param {{
 *   ts?: string,
 *   type:
 *     | 'harness_dispatch'
 *     | 'harness_packet'
 *     | 'tool_invocation'
 *     | 'tool_result'
 *     | 'execution_note',
 *   summary: string,
 *   payload?: Record<string, unknown>,
 * }} artifact
 */
export async function appendExecutionArtifact(threadKey, artifact) {
  const list = await readAll(threadKey);
  list.push({
    ts: String(artifact.ts || new Date().toISOString()),
    type: artifact.type,
    summary: String(artifact.summary || '').slice(0, 2000),
    payload:
      artifact.payload && typeof artifact.payload === 'object' && !Array.isArray(artifact.payload)
        ? artifact.payload
        : {},
  });
  await writeAll(threadKey, list);
}

/**
 * @param {string} threadKey
 * @param {number} limit
 */
export async function readRecentExecutionArtifacts(threadKey, limit = 5) {
  const list = await readAll(threadKey);
  if (list.length <= limit) return list;
  return list.slice(-limit);
}

/** @param {string} threadKey */
export async function clearExecutionArtifacts(threadKey) {
  const fp = path.join(ledgerDir(), safeFileName(threadKey));
  try {
    await fs.unlink(fp);
  } catch {
    /* 없으면 무시 */
  }
}
