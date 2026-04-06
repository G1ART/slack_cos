/**
 * 현재 턴 컨트롤러: 텍스트·첨부를 COS에 넘길 뿐, 의미 해석 없음.
 */

import { ingestCurrentTurnAttachments } from './ingestAttachments.js';
import { runFounderDirectConversation } from './runFounderDirectConversation.js';

/**
 * @param {import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent} event
 */
export function extractSlackUserText(event) {
  let t = String(event.text || '').trim();
  t = t.replace(/<@[^>\s]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
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

  return runFounderDirectConversation({
    openai: ctx.openai,
    model: ctx.model,
    constitutionMarkdown: ctx.constitutionMarkdown,
    constitutionSha256: ctx.constitutionSha256,
    userText: rawText,
    attachmentResults,
    metadata,
  });
}
