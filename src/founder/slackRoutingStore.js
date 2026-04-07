/**
 * thread_key → Slack proactive post 경로 (멘션 스레드·DM). Socket Mode 단일 소비 전제.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';

function routingDir() {
  return path.join(cosRuntimeBaseDir(), 'slack_routing');
}

/** @param {string} threadKey */
function safeName(threadKey) {
  return `${Buffer.from(String(threadKey), 'utf8').toString('base64url')}.json`;
}

/**
 * @param {string} threadKey
 * @param {{ channel: string, thread_ts?: string | null }} row
 */
export async function saveSlackRouting(threadKey, row) {
  const ch = String(row.channel || '').trim();
  if (!ch) return;
  const dir = routingDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, safeName(threadKey));
  const ts = row.thread_ts != null && String(row.thread_ts).trim() ? String(row.thread_ts).trim() : null;
  await fs.writeFile(
    fp,
    JSON.stringify({ channel: ch, thread_ts: ts, updated_at: new Date().toISOString() }, null, 0),
    'utf8',
  );
}

/**
 * @param {string} threadKey
 * @returns {Promise<{ channel: string, thread_ts: string | null } | null>}
 */
export async function getSlackRouting(threadKey) {
  const fp = path.join(routingDir(), safeName(threadKey));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    const channel = String(j.channel || '').trim();
    if (!channel) return null;
    const thread_ts = j.thread_ts != null && String(j.thread_ts).trim() ? String(j.thread_ts).trim() : null;
    return { channel, thread_ts };
  } catch {
    return null;
  }
}
