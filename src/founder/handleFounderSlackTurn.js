/**
 * 현재 턴 컨트롤러: thread raw memory 읽기·쓰기만. 의미 해석 없음.
 */

import { ingestCurrentTurnAttachments } from './ingestAttachments.js';
import { runFounderDirectConversation } from './runFounderDirectConversation.js';
import { appendThreadTurn, readRecentThreadTurns } from './threadMemory.js';

/**
 * @param {import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent} event
 */
export function extractSlackUserText(event) {
  let t = String(event.text || '').trim();
  t = t.replace(/<@[^>\s]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * 멘션: channel + 스레드 루트 ts. DM: channel + thread_ts || ts
 * @param {import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent} event
 */
export function computeThreadKey(event) {
  const ch = String(event.channel || '');
  if (event.channel_type === 'im') {
    return `dm:${ch}:${event.thread_ts || event.ts}`;
  }
  const root = event.thread_ts || event.ts;
  return `mention:${ch}:${root}`;
}

/**
 * @param {{
 *   event: import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent,
 *   body: Record<string, unknown>,
 *   client: import('@slack/web-api').WebClient,
 *   openai: import('openai').default,
 *   model: string,
 *   visionModel?: string,
 *   constitutionMarkdown: string,
 *   constitutionSha256: string,
 * }} ctx
 */
export async function handleFounderSlackTurn(ctx) {
  const threadKey = computeThreadKey(ctx.event);
  const rawText = extractSlackUserText(ctx.event);
  const files = Array.isArray(ctx.event.files) ? ctx.event.files : [];

  const attachmentResults = await ingestCurrentTurnAttachments({
    client: ctx.client,
    files,
    openai: ctx.openai,
    model: ctx.model,
    visionModel: ctx.visionModel,
  });

  const metadata = {
    channel: ctx.event.channel,
    user: ctx.event.user,
    ts: ctx.event.ts,
    thread_ts: ctx.event.thread_ts,
    channel_type: ctx.event.channel_type,
    event_id: ctx.body?.event_id,
  };

  const recentTurns = await readRecentThreadTurns(threadKey, 12);

  const out = await runFounderDirectConversation({
    openai: ctx.openai,
    model: ctx.model,
    constitutionMarkdown: ctx.constitutionMarkdown,
    constitutionSha256: ctx.constitutionSha256,
    userText: rawText,
    attachmentResults,
    metadata,
    recentTurns,
  });

  const now = new Date().toISOString();
  await appendThreadTurn(threadKey, {
    ts: now,
    role: 'user',
    text: rawText,
    attachments: attachmentResults.map((r) => ({
      filename: r.filename,
      ok: r.ok,
      summary: r.summary,
      reason: r.reason,
    })),
  });
  await appendThreadTurn(threadKey, {
    ts: now,
    role: 'assistant',
    text: out.text,
    attachments: [],
  });

  return { text: out.text, threadKey };
}
