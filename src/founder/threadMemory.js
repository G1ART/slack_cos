/**
 * Thread 단위 raw transcript만 저장. tracked 경로 사용 금지.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function baseDir() {
  const env = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

function threadsDir() {
  return path.join(baseDir(), 'threads');
}

/** @param {string} threadKey */
function safeFileName(threadKey) {
  const b = Buffer.from(String(threadKey), 'utf8').toString('base64url');
  return `${b}.json`;
}

async function readAll(threadKey) {
  const fp = path.join(threadsDir(), safeFileName(threadKey));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.turns) ? j.turns : [];
  } catch {
    return [];
  }
}

async function writeAll(threadKey, turns) {
  const dir = threadsDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, safeFileName(threadKey));
  await fs.writeFile(fp, JSON.stringify({ turns }, null, 0), 'utf8');
}

/**
 * @param {string} threadKey
 * @param {{ ts: string, role: 'user'|'assistant', text: string, attachments?: object[] }} turn
 */
export async function appendThreadTurn(threadKey, turn) {
  const turns = await readAll(threadKey);
  turns.push({
    ts: String(turn.ts || new Date().toISOString()),
    role: turn.role,
    text: String(turn.text || ''),
    attachments: Array.isArray(turn.attachments) ? turn.attachments : [],
  });
  await writeAll(threadKey, turns);
}

/**
 * @param {string} threadKey
 * @param {number} limit
 */
export async function readRecentThreadTurns(threadKey, limit = 12) {
  const turns = await readAll(threadKey);
  if (turns.length <= limit) return turns;
  return turns.slice(-limit);
}

/** @param {string} threadKey */
export async function clearThread(threadKey) {
  const fp = path.join(threadsDir(), safeFileName(threadKey));
  try {
    await fs.unlink(fp);
  } catch {
    /* 없으면 무시 */
  }
}
