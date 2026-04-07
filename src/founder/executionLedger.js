/**
 * Thread 단위 execution evidence (review-loop visibility spine). tracked 경로 사용 금지.
 *
 * Artifact types: harness_dispatch | harness_packet | tool_invocation | tool_result | execution_note
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function cosRuntimeBaseDir() {
  const env = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

function ledgerDir() {
  return path.join(cosRuntimeBaseDir(), 'execution');
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
 * @param {Record<string, unknown>} row
 */
function normalizeArtifactRow(row) {
  const pl = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  const statusFromPayload = pl.status;
  return {
    ...row,
    status: row.status != null ? row.status : statusFromPayload != null ? statusFromPayload : null,
    attempt: typeof row.attempt === 'number' && row.attempt >= 1 ? row.attempt : 1,
    supersedes: row.supersedes != null ? String(row.supersedes) : null,
    needs_review: Boolean(row.needs_review),
    review_focus: Array.isArray(row.review_focus) ? row.review_focus.map(String) : [],
  };
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
 *   status?: string | null,
 *   attempt?: number,
 *   supersedes?: string | null,
 *   needs_review?: boolean,
 *   review_focus?: string[],
 * }} artifact
 */
export async function appendExecutionArtifact(threadKey, artifact) {
  const list = await readAll(threadKey);
  const normalized = normalizeArtifactRow({
    ts: String(artifact.ts || new Date().toISOString()),
    type: artifact.type,
    summary: String(artifact.summary || '').slice(0, 2000),
    payload:
      artifact.payload && typeof artifact.payload === 'object' && !Array.isArray(artifact.payload)
        ? artifact.payload
        : {},
    status: artifact.status,
    attempt: artifact.attempt,
    supersedes: artifact.supersedes,
    needs_review: artifact.needs_review,
    review_focus: artifact.review_focus,
  });
  list.push(normalized);
  await writeAll(threadKey, list);
}

/**
 * @param {string} threadKey
 * @param {number} limit
 */
export async function readRecentExecutionArtifacts(threadKey, limit = 5) {
  const list = await readAll(threadKey);
  const mapped = list.map((r) => normalizeArtifactRow(r));
  if (mapped.length <= limit) return mapped;
  return mapped.slice(-limit);
}

/**
 * COS 모델 입력용 한 줄 요약 (JSON 덩어리 대신).
 * @param {string} threadKey
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
export async function readExecutionSummary(threadKey, limit = 5) {
  const rows = await readRecentExecutionArtifacts(threadKey, limit);
  return rows.map(formatExecutionSummaryLine);
}

/**
 * @param {Record<string, unknown>} a
 */
export function formatExecutionSummaryLine(a) {
  const pl = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? a.payload : {};
  const type = String(a.type || '');
  const st = a.status != null ? String(a.status) : pl.status != null ? String(pl.status) : '';
  const stPart = st ? `${st}: ` : '';

  if (type === 'harness_dispatch') {
    const shape = pl.team_shape || '?';
    const obj = String(pl.objective || a.summary || '').slice(0, 100);
    return `- harness_dispatch ${stPart}${shape} / objective: ${obj}`;
  }
  if (type === 'harness_packet') {
    const ps = pl.packet_status || 'ready';
    const pt = pl.preferred_tool || '?';
    const pa = pl.preferred_action || '?';
    const persona = pl.persona || '?';
    return `- harness_packet ${ps}: ${persona} -> ${pt}.${pa}`;
  }
  if (type === 'tool_invocation') {
    const mode = pl.execution_mode || 'artifact';
    const tool = pl.tool || '?';
    const action = pl.action || '?';
    const invSt = pl.status || st || 'accepted';
    return `- tool_invocation ${invSt}: ${tool}.${action} / ${mode}`;
  }
  if (type === 'tool_result') {
    const tool = pl.tool || '?';
    const action = pl.action || '?';
    const mode = pl.execution_mode || '?';
    const rs = pl.status || st || 'completed';
    const next = pl.next_required_input ? ` / next: ${String(pl.next_required_input).slice(0, 60)}` : '';
    const ap = pl.artifact_path ? ` / path: ${pl.artifact_path}` : '';
    return `- tool_result ${rs}: ${tool}.${action} / ${mode}${ap}${next}`;
  }
  if (type === 'execution_note') {
    return `- execution_note: ${String(a.summary || '').slice(0, 200)}`;
  }
  return `- ${type}: ${String(a.summary || '').slice(0, 120)}`;
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
