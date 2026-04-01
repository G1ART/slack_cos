/**
 * M2a — minimal inbound turn trace (append-only JSONL, lineage spine).
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md §10
 */

import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs/promises';
import path from 'path';
import { resolveInboundTurnTracePath } from '../storage/paths.js';
import { buildSlackThreadKey } from './slackConversationBuffer.js';

const inboundTurnAls = new AsyncLocalStorage();

function traceDisabled() {
  return (
    process.env.INBOUND_TURN_TRACE_DISABLE === '1' ||
    process.env.INBOUND_TURN_TRACE_DISABLE === 'true'
  );
}

/**
 * @param {string | null | undefined} target_id
 * @returns {{ plan_id: string | null, work_id: string | null, run_id: string | null }}
 */
function inferLinkageFromTargetId(target_id) {
  const tid = target_id ? String(target_id).trim() : '';
  if (!tid) return { plan_id: null, work_id: null, run_id: null };
  if (/^PLN-/i.test(tid)) return { plan_id: tid, work_id: null, run_id: null };
  if (/^WRK-/i.test(tid)) return { plan_id: null, work_id: tid, run_id: null };
  if (/^RUN-/i.test(tid)) return { plan_id: null, work_id: null, run_id: tid };
  return { plan_id: null, work_id: null, run_id: null };
}

/**
 * `finalizeSlackResponse` 가 동기로 호출되므로 여기서만 ALS 갱신 (await 금지).
 * @param {{
 *   responder: string,
 *   command_name?: string | null,
 *   target_id?: string | null,
 *   response_type?: string,
 *   packet_id?: string | null,
 *   status_packet_id?: string | null,
 *   work_queue_id?: string | null,
 * }} fields
 */
/**
 * @returns {{ turn_id: string, thread_key: string, slack_route_label?: string, finalize?: object } | null}
 */
export function getInboundTurnTraceStore() {
  return inboundTurnAls.getStore() || null;
}

/**
 * Slack 진입 경로 라벨 (registerHandlers meta → app.js).
 * @param {string} label
 */
export function setInboundTurnSlackRouteLabel(label) {
  const store = inboundTurnAls.getStore();
  if (store && label) store.slack_route_label = String(label);
}

export function markInboundTurnFinalize(fields) {
  if (traceDisabled()) return;
  const store = inboundTurnAls.getStore();
  if (!store) return;
  store.finalize = {
    final_responder: fields.responder,
    command_name: fields.command_name ?? null,
    target_id: fields.target_id ?? null,
    response_type: fields.response_type ?? null,
    packet_id: fields.packet_id ?? null,
    status_packet_id: fields.status_packet_id ?? null,
    work_queue_id: fields.work_queue_id ?? null,
  };
}

function buildRecord(store, { status, error, duration_ms }) {
  const fin = store.finalize || {};
  const link = inferLinkageFromTargetId(fin.target_id);
  const surface_intent =
    fin.final_responder === 'executive_surface'
      ? fin.command_name || 'executive_surface'
      : null;

  const base = {
    turn_id: store.turn_id,
    thread_key: store.thread_key,
    channel_id: store.channel_id,
    user_id: store.user_id,
    timestamp: store.timestamp,
    input_text_normalized: store.input_text_normalized,
    final_responder: fin.final_responder ?? (status === 'ok' ? 'structured' : 'error'),
    surface_intent,
    command_name: fin.command_name ?? null,
    response_type: fin.response_type ?? null,
    packet_id: fin.packet_id ?? null,
    status_packet_id: fin.status_packet_id ?? null,
    work_queue_id: fin.work_queue_id ?? null,
    plan_id: link.plan_id,
    work_id: link.work_id,
    run_id: link.run_id,
    approval_id: null,
    status,
    duration_ms,
    error: error ?? null,
  };
  if (store.inbound_audit && typeof store.inbound_audit === 'object') {
    base.inbound_audit = store.inbound_audit;
  }
  return base;
}

export async function appendInboundTurnTraceRecord(record) {
  if (traceDisabled()) return;
  const fp = resolveInboundTurnTracePath();
  const line = `${JSON.stringify(record)}\n`;
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, line, 'utf8');
}

/**
 * Slack `handleUserText` 한 턴을 감싼다. `finalizeSlackResponse` 가 TLS에 메타를 남기면 그걸 쓰고,
 * 구조화 분기처럼 finalize 가 없으면 `structured` 로 기록한다.
 *
 * @param {Record<string, unknown>} metadata
 * @param {string} input_text_normalized
 * @param {() => Promise<unknown>} fn
 */
export async function runInboundTurnTraceScope(metadata, input_text_normalized, fn) {
  if (traceDisabled()) {
    return fn();
  }

  const turn_id = crypto.randomUUID();
  const thread_key = buildSlackThreadKey(metadata);
  const channel_id = metadata.channel != null ? String(metadata.channel) : null;
  const user_id = metadata.user != null ? String(metadata.user) : null;
  const timestamp = new Date().toISOString();

  const store = {
    turn_id,
    thread_key,
    channel_id,
    user_id,
    timestamp,
    input_text_normalized,
    finalize: null,
  };

  return inboundTurnAls.run(store, async () => {
    const startedAt = Date.now();
    try {
      const result = await fn();
      const duration_ms = Date.now() - startedAt;
      const rec = buildRecord(inboundTurnAls.getStore(), {
        status: 'ok',
        error: null,
        duration_ms,
      });
      await appendInboundTurnTraceRecord(rec);
      return result;
    } catch (err) {
      const duration_ms = Date.now() - startedAt;
      const rec = buildRecord(inboundTurnAls.getStore(), {
        status: 'error',
        error: String(err?.message || err),
        duration_ms,
      });
      await appendInboundTurnTraceRecord(rec);
      throw err;
    }
  });
}
