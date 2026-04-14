/**
 * 현재 턴 컨트롤러: thread key·첨부·user memory 선행·COS 호출. assistant memory는 송신 성공 후 상위에서.
 */

import { ingestCurrentTurnAttachments } from './ingestAttachments.js';
import { runFounderDirectConversation } from './runFounderDirectConversation.js';
import { appendThreadTurn, readRecentThreadTurns } from './threadMemory.js';
import { saveSlackRouting } from './slackRoutingStore.js';
import { tickRunSupervisorForThread } from './runSupervisor.js';
import { slackTeamIdFromEvent } from './slackEventTenancy.js';

/**
 * @param {import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent} event
 */
export function extractSlackUserText(event) {
  let t = String(event.text || '').trim();
  t = t.replace(/<@[^>\s]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * DM: 채널 단일 연속 대화. mention: root thread 단일 연속 대화.
 * @param {import('@slack/types').AppMentionEvent | import('@slack/types').MessageEvent} event
 */
export function computeThreadKey(event = {}) {
  const channel = String(event.channel || '').trim();

  if (event.channel_type === 'im') {
    return `dm:${channel}`;
  }

  const rootTs = String(event.thread_ts || event.ts || '').trim();
  return `mention:${channel}:${rootTs}`;
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

  const routeTs =
    ctx.event.channel_type === 'im'
      ? null
      : String(ctx.event.thread_ts || ctx.event.ts || '').trim() || null;
  await saveSlackRouting(threadKey, {
    channel: String(ctx.event.channel || ''),
    thread_ts: routeTs,
  });

  const slack_team_id = slackTeamIdFromEvent(ctx.event);
  console.info(
    JSON.stringify({
      event: 'cos_turn_ingress',
      channel: ctx.event.channel || null,
      channel_type: ctx.event.channel_type || null,
      thread_ts: ctx.event.thread_ts || null,
      user: ctx.event.user || null,
      text_len: rawText.length,
      file_count: files.length,
      ...(slack_team_id ? { slack_team_id } : {}),
    }),
  );

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

  const now = new Date().toISOString();
  const userTurn = {
    ts: now,
    role: /** @type {'user'} */ ('user'),
    text: rawText,
    attachments: attachmentResults.map((r) => ({
      filename: r.filename,
      ok: r.ok,
      summary: r.summary,
      reason: r.reason,
    })),
  };

  await appendThreadTurn(threadKey, userTurn);

  const recent = await readRecentThreadTurns(threadKey, 13);
  const priorTurns = recent.length > 0 && recent[recent.length - 1]?.role === 'user' ? recent.slice(0, -1) : recent;

  const out = await runFounderDirectConversation({
    openai: ctx.openai,
    model: ctx.model,
    constitutionMarkdown: ctx.constitutionMarkdown,
    constitutionSha256: ctx.constitutionSha256,
    userText: rawText,
    attachmentResults,
    metadata,
    recentTurns: priorTurns,
    threadKey,
  });

  try {
    await tickRunSupervisorForThread(threadKey, {
      client: ctx.client,
      constitutionSha256: ctx.constitutionSha256,
      skipLease: true,
    });
  } catch (e) {
    console.error('[cos_eager_supervisor]', e);
  }

  const assistantTurnCandidate = {
    role: /** @type {'assistant'} */ ('assistant'),
    text: out.text,
    attachments: attachmentResults.map((r) => ({
      filename: r.filename,
      ok: r.ok,
      summary: r.summary,
      reason: r.reason,
    })),
  };

  return {
    starter_ack: out.starter_ack,
    threadKey,
    userTurn,
    assistantTurnCandidate,
  };
}
