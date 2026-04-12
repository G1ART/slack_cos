/**
 * Founder 전용 Slack 핸들러: 멘션 + DM + (라우팅된) 채널 스레드 후속.
 * 최종 송신은 sendFounderResponse만 — 본문은 모델 `text`(= starter_ack).
 */

import {
  handleFounderSlackTurn,
  extractSlackUserText,
} from './handleFounderSlackTurn.js';
import { sendFounderResponse } from './sendFounderResponse.js';
import { appendThreadTurn } from './threadMemory.js';
import { getSlackRouting } from './slackRoutingStore.js';
import { getSlackBotUserId } from './slackBotIdentity.js';

const FOUNDER_ERROR_USER_TEXT = `죄송합니다. 방금 응답을 보내는 중 문제가 생겼습니다.
같은 메시지를 한 번 더 보내 주시면 바로 이어서 받겠습니다.`;

/**
 * @param {{
 *   openai: import('openai').default,
 *   model: string,
 *   visionModel?: string,
 *   constitutionMarkdown: string,
 *   constitutionSha256: string,
 * }} core
 * @param {Awaited<ReturnType<typeof handleFounderSlackTurn>>} out
 * @param {{
 *   say?: import('@slack/bolt').SayFn,
 *   client?: import('@slack/web-api').WebClient,
 *   channel?: string,
 *   thread_ts?: string,
 * }} sendOpts
 */
async function postFounderModelReply(core, out, sendOpts) {
  const sendRes = await sendFounderResponse({
    ...sendOpts,
    text: out.starter_ack,
    constitutionSha256: core.constitutionSha256,
  });
  if (sendRes.ok) {
    await appendThreadTurn(out.threadKey, {
      ...out.assistantTurnCandidate,
      ts: new Date().toISOString(),
    });
  }
  return sendRes;
}

/**
 * @param {import('@slack/bolt').App} app
 * @param {{
 *   openai: import('openai').default,
 *   model: string,
 *   visionModel?: string,
 *   constitutionMarkdown: string,
 *   constitutionSha256: string,
 * }} core
 */
export function registerFounderHandlers(app, core) {
  app.event('app_mention', async ({ event, say, client, body }) => {
    try {
      const files = Array.isArray(event.files) ? event.files : [];
      if (!extractSlackUserText(event) && files.length === 0) {
        await sendFounderResponse({
          say,
          thread_ts: event.thread_ts || event.ts,
          text: '지시 내용을 함께 적어 주세요.',
          constitutionSha256: core.constitutionSha256,
        });
        return;
      }

      const out = await handleFounderSlackTurn({
        event,
        body,
        client,
        openai: core.openai,
        model: core.model,
        visionModel: core.visionModel,
        constitutionMarkdown: core.constitutionMarkdown,
        constitutionSha256: core.constitutionSha256,
      });

      const mentionThreadTs = event.thread_ts || event.ts;
      await postFounderModelReply(core, out, { say, thread_ts: mentionThreadTs });
    } catch (e) {
      console.error('[app_mention]', e);
      await sendFounderResponse({
        say,
        thread_ts: event.thread_ts || event.ts,
        text: FOUNDER_ERROR_USER_TEXT,
        constitutionSha256: core.constitutionSha256,
      });
    }
  });

  app.event('message', async ({ event, client, body }) => {
    if (event.bot_id) return;
    const st = event.subtype;
    if (st && st !== 'file_share') return;

    const files = Array.isArray(event.files) ? event.files : [];

    if (event.channel_type === 'im') {
      if (!extractSlackUserText(event) && files.length === 0) return;

      try {
        const out = await handleFounderSlackTurn({
          event,
          body,
          client,
          openai: core.openai,
          model: core.model,
          visionModel: core.visionModel,
          constitutionMarkdown: core.constitutionMarkdown,
          constitutionSha256: core.constitutionSha256,
        });

        await postFounderModelReply(core, out, { client, channel: event.channel });
      } catch (e) {
        console.error('[dm]', e);
        if (event.channel) {
          await sendFounderResponse({
            client,
            channel: event.channel,
            text: FOUNDER_ERROR_USER_TEXT,
            constitutionSha256: core.constitutionSha256,
          });
        }
      }
      return;
    }

    const rootTs = String(event.thread_ts || '').trim();
    if (!rootTs) return;
    if (!event.user) return;

    const botUid = await getSlackBotUserId(client);
    const txt = String(event.text || '');
    if (botUid && txt.includes(`<@${botUid}>`)) return;

    const channel = String(event.channel || '').trim();
    if (!channel) return;

    const threadKey = `mention:${channel}:${rootTs}`;
    const route = await getSlackRouting(threadKey);
    if (!route) return;

    if (!extractSlackUserText(event) && files.length === 0) return;
    if (botUid && event.user === botUid) return;

    try {
      const out = await handleFounderSlackTurn({
        event,
        body,
        client,
        openai: core.openai,
        model: core.model,
        visionModel: core.visionModel,
        constitutionMarkdown: core.constitutionMarkdown,
        constitutionSha256: core.constitutionSha256,
      });

      await postFounderModelReply(core, out, {
        client,
        channel,
        thread_ts: rootTs,
      });
    } catch (e) {
      console.error('[channel_thread_reply]', e);
      await sendFounderResponse({
        client,
        channel,
        thread_ts: rootTs,
        text: FOUNDER_ERROR_USER_TEXT,
        constitutionSha256: core.constitutionSha256,
      });
    }
  });
}
