/**
 * 외부 에이전트 런타임(하네스·워커)으로 작업 지시를 HTTP POST — v0 옵트인.
 * 슬랙 밖에서 Cursor/Git/Supabase 등 툴을 붙이려면 이 URL에서 수신해 실행하면 됨.
 *
 * COS_AGENT_BRIDGE_URL — POST 대상 (비어 있으면 전송 안 함)
 * COS_AGENT_BRIDGE_SECRET — 선택; 설정 시 헤더 X-COS-Agent-Bridge-Secret 로 전달
 * COS_BRIDGE_INSTANCE_ID — 선택; 페이로드 cos_instance 기본 식별자
 */
import { formatError } from '../util/formatError.js';

const HANDOFF_MARKDOWN_MAX = 100_000;
const JSON_FIELD_MAX = 32_000;
const FETCH_TIMEOUT_MS = 20_000;

/** @returns {boolean} */
export function isAgentBridgeConfigured() {
  return Boolean(String(process.env.COS_AGENT_BRIDGE_URL || '').trim());
}

/**
 * 설정되어 있을 때만 비동기 POST (실패해도 Slack 경로는 영향 없음).
 * @param {Record<string, unknown>} payload
 */
export function fireAgentBridgeNotify(payload) {
  if (!isAgentBridgeConfigured()) return;
  const url = String(process.env.COS_AGENT_BRIDGE_URL || '').trim();
  const secret = String(process.env.COS_AGENT_BRIDGE_SECRET || '').trim();
  const envelope = {
    ...payload,
    cos_instance: String(process.env.COS_BRIDGE_INSTANCE_ID || 'default').trim() || 'default',
    emitted_at: new Date().toISOString(),
  };
  queueMicrotask(() => {
    void sendAgentBridgePost(url, secret, envelope).catch((e) => {
      console.warn('[agent-bridge]', 'notify_failed', formatError(e));
    });
  });
}

/**
 * @param {string} url
 * @param {string} secret
 * @param {Record<string, unknown>} envelope
 */
async function sendAgentBridgePost(url, secret, envelope) {
  const body = JSON.stringify(envelope);
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'g1-cos-slack-agent-bridge/1',
  };
  if (secret) headers['X-COS-Agent-Bridge-Secret'] = secret;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[agent-bridge]', 'http_error', res.status, txt.slice(0, 500));
      return;
    }
    const tool = envelope && typeof envelope === 'object' ? String(envelope.tool || '') : '';
    console.info(
      JSON.stringify({
        event: 'agent_bridge_outbound_ok',
        status: res.status,
        tool: tool || null,
        work_id: envelope && 'work_id' in envelope ? envelope.work_id : null,
        run_id: envelope && 'run_id' in envelope ? envelope.run_id : null,
      }),
    );
  } finally {
    clearTimeout(t);
  }
}

/** @param {unknown} v @param {number} max */
export function safeJsonSlice(v, max = JSON_FIELD_MAX) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…(truncated)`;
  } catch {
    return '';
  }
}

export function handoffMarkdownForBridge(full) {
  const s = String(full || '');
  if (s.length <= HANDOFF_MARKDOWN_MAX) return { text: s, truncated: false };
  return { text: s.slice(0, HANDOFF_MARKDOWN_MAX), truncated: true };
}

/**
 * @param {Record<string, unknown> | undefined} metadata
 */
export function slackSourceForBridge(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  return {
    channel: metadata.channel != null ? String(metadata.channel) : null,
    user: metadata.user != null ? String(metadata.user) : null,
    message_ts: metadata.message_ts != null ? String(metadata.message_ts) : null,
  };
}
