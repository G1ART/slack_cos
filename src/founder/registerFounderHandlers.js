/**
 * Founder 전용 Slack 핸들러: 멘션 + DM. 최종 송신은 sendFounderResponse만.
 */

import { handleFounderSlackTurn, extractSlackUserText } from './handleFounderSlackTurn.js';
import { sendFounderResponse } from './sendFounderResponse.js';
import { appendThreadTurn } from './threadMemory.js';

const FOUNDER_ERROR_USER_TEXT = `죄송합니다. 방금 응답을 보내는 중 문제가 생겼습니다.
같은 메시지를 한 번 더 보내 주시면 바로 이어서 받겠습니다.`;

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
      const sendRes = await sendFounderResponse({
        say,
        thread_ts: mentionThreadTs,
        text: out.answer,
        constitutionSha256: core.constitutionSha256,
      });

      if (sendRes.ok) {
        await appendThreadTurn(out.threadKey, {
          ...out.assistantTurnCandidate,
          ts: new Date().toISOString(),
        });
      }
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
    if (event.channel_type !== 'im') return;
    if (event.subtype && event.subtype !== 'file_share') return;
    if (event.bot_id) return;

    try {
      const files = Array.isArray(event.files) ? event.files : [];
      if (!extractSlackUserText(event) && files.length === 0) return;

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

      const sendRes = await sendFounderResponse({
        client,
        channel: event.channel,
        text: out.answer,
        constitutionSha256: core.constitutionSha256,
      });

      if (sendRes.ok) {
        await appendThreadTurn(out.threadKey, {
          ...out.assistantTurnCandidate,
          ts: new Date().toISOString(),
        });
      }
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
  });
}
