/**
 * DM·채널 스레드별 최근 대화 버퍼.
 * - 기본: 프로세스 메모리 (`CONVERSATION_BUFFER_DISABLE=1` 이면 no-op).
 * - 선택: `CONVERSATION_BUFFER_PERSIST=true` + `data/slack-conversation-buffer.json` (또는 `CONVERSATION_BUFFER_FILE`).
 * - 슬래시 `/g1cos`: `recordSlashCommandExchange` — 기본 기록; `CONVERSATION_BUFFER_RECORD_SLASH=0` 이면 생략.
 *
 * @see docs/cursor-handoffs/COS_NorthStar_Workflow_2026-03.md (대화 버퍼 영속화 1단계)
 */

import fs from 'fs/promises';
import path from 'path';
import { CONVERSATION_BUFFER_FILE } from '../storage/paths.js';

const disabled = () => process.env.CONVERSATION_BUFFER_DISABLE === '1' || process.env.CONVERSATION_BUFFER_DISABLE === 'true';

const slashBufferDisabled = () =>
  process.env.CONVERSATION_BUFFER_RECORD_SLASH === '0' ||
  process.env.CONVERSATION_BUFFER_RECORD_SLASH === 'false';

const persistEnabled = () => {
  const v = process.env.CONVERSATION_BUFFER_PERSIST;
  if (v === '0' || v === 'false') return false;
  return true;
};

const MAX_KEYS = Number(process.env.CONVERSATION_BUFFER_MAX_KEYS || 400) || 400;
const MAX_MESSAGES = Number(process.env.CONVERSATION_BUFFER_MAX_MESSAGES || 24) || 24;
const MAX_TRANSCRIPT_CHARS = Number(process.env.CONVERSATION_BUFFER_MAX_CHARS || 8000) || 8000;

/** @type {Map<string, { messages: { role: 'user'|'assistant', text: string, at: string }[], touch: number }>} */
const buckets = new Map();

/** @returns {string} */
function bufferFilePath() {
  return process.env.CONVERSATION_BUFFER_FILE || CONVERSATION_BUFFER_FILE;
}

let persistTimer = null;

function evictIfNeeded() {
  while (buckets.size > MAX_KEYS) {
    let oldestKey = null;
    let oldestT = Infinity;
    for (const [k, v] of buckets) {
      if (v.touch < oldestT) {
        oldestT = v.touch;
        oldestKey = k;
      }
    }
    if (oldestKey == null) break;
    buckets.delete(oldestKey);
  }
}

async function writeBufferFile() {
  if (!persistEnabled() || disabled()) return;
  const fp = bufferFilePath();
  const entries = [...buckets.entries()].map(([k, v]) => [k, { messages: v.messages, touch: v.touch }]);
  const payload = JSON.stringify(
    { version: 1, savedAt: new Date().toISOString(), buckets: entries },
    null,
    0
  );
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, payload, 'utf8');
}

function schedulePersist() {
  if (!persistEnabled() || disabled()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeBufferFile().catch((e) => console.warn('[conversation_buffer] persist failed:', e?.message || e));
  }, 450);
}

/**
 * `ensureStorage` 직후 호출 — 디스크에 저장된 버킷을 메모리로 복구.
 */
export async function loadConversationBufferFromDisk() {
  if (!persistEnabled() || disabled()) return 0;
  const fp = bufferFilePath();
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.buckets)) return 0;
    buckets.clear();
    for (const row of data.buckets) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const [k, v] = row;
      if (k && v && Array.isArray(v.messages)) {
        buckets.set(String(k), { messages: v.messages, touch: Number(v.touch) || 0 });
      }
    }
    evictIfNeeded();
    return buckets.size;
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code !== 'ENOENT') {
      console.warn('[conversation_buffer] load failed:', e?.message || e);
    }
    return 0;
  }
}

/** SIGINT/SIGTERM 등 종료 직전에 디스크로 플러시 */
export async function flushConversationBufferToDisk() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await writeBufferFile();
}

/**
 * Slack 메타데이터로 버킷 키 생성.
 * - DM: 채널 ID만 (대화당 고유)
 * - 채널 멘션: 스레드 루트 `thread_ts`가 있으면 동일 스레드 공유, 없으면 해당 메시지 `ts`로 분리
 */
export function buildSlackThreadKey(metadata = {}) {
  const ch = metadata.channel || 'no_channel';
  if (metadata.source_type === 'direct_message') {
    return `im:${ch}`;
  }
  const threadRoot = metadata.thread_ts || metadata.ts || 'root';
  return `ch:${ch}:t:${threadRoot}`;
}

/**
 * `/g1cos` 등 슬래시 — DM은 일반 DM과 동일 `im:` 키, 공개·비공개 채널은 `ch:…:slash:user` 로 사용자별 분리.
 * @param {{ channel_id?: string, channel_name?: string, user_id?: string }} command Bolt `command` 객체 일부
 */
export function buildSlashCommandBufferKey(command = {}) {
  const ch = String(command.channel_id || 'no_channel');
  const user = String(command.user_id || 'unknown');
  const cname = String(command.channel_name || '').toLowerCase();
  if (cname === 'directmessage' || ch.startsWith('D')) {
    return `im:${ch}`;
  }
  return `ch:${ch}:slash:${user}`;
}

/**
 * 슬래시 `/g1cos` 사용자 입력·봇 응답을 버퍼에 남김 (멘션/DM 감사·DM 맥락 정합).
 * `CONVERSATION_BUFFER_RECORD_SLASH=0` 이면 생략.
 */
export function recordSlashCommandExchange(command, userText, assistantText) {
  if (disabled() || slashBufferDisabled()) return;
  const key = buildSlashCommandBufferKey(command);
  const u = String(userText || '').trim();
  const a = String(assistantText || '').trim();
  if (u) recordConversationTurn(key, 'user', u);
  if (a) recordConversationTurn(key, 'assistant', a);
}

/**
 * @param {string} key
 * @param {'user'|'assistant'} role
 * @param {string} text
 */
export function recordConversationTurn(key, role, text) {
  if (disabled()) return;
  const t = String(text || '').trim();
  if (!t) return;
  let b = buckets.get(key);
  if (!b) {
    b = { messages: [], touch: Date.now() };
    buckets.set(key, b);
  }
  b.messages.push({ role, text: t.slice(0, 12000), at: new Date().toISOString() });
  while (b.messages.length > MAX_MESSAGES) {
    b.messages.shift();
  }
  b.touch = Date.now();
  evictIfNeeded();
  schedulePersist();
}

/**
 * 현재 턴 **이전**까지의 대화만 반환 (방금 record 한 user 메시지 제외하려면 호출 순서에 유의).
 * @param {string} key
 * @returns {string}
 */
export function getConversationTranscript(key) {
  if (disabled()) return '';
  const b = buckets.get(key);
  if (!b?.messages?.length) return '';

  const lines = [];
  let total = 0;
  for (const m of b.messages) {
    const label = m.role === 'user' ? '사용자' : 'COS';
    const chunk = `[${label}]\n${m.text}`;
    if (total + chunk.length > MAX_TRANSCRIPT_CHARS) break;
    lines.push(chunk);
    total += chunk.length + 2;
  }
  return lines.join('\n\n');
}

/** 테스트·핫 리로드용 */
export function clearConversationBuffer() {
  buckets.clear();
  schedulePersist();
}
