/**
 * Founder 전용 Slack 핸들러: 멘션 + DM. 최종 송신은 sendFounderResponse만.
 */

import { handleFounderSlackTurn, extractSlackUserText } from './handleFounderSlackTurn.js';
import { sendFounderResponse, parseForbiddenPhrasesFromConstitution } from './sendFounderResponse.js';

function formatErr(e) {
  return [e?.name, e?.code, e?.message].filter(Boolean).join(' | ') || String(e);
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
  const forbiddenPhrases = parseForbiddenPhrasesFromConstitution(core.constitutionMarkdown);

  app.event('app_mention', async ({ event, say, client, body }) => {
    try {
      const files = Array.isArray(event.files) ? event.files : [];
      if (!extractSlackUserText(event) && files.length === 0) {
        await sendFounderResponse({
          say,
          thread_ts: event.ts,
          text: '지시 내용을 함께 적어 주세요.',
          constitutionSha256: core.constitutionSha256,
          forbiddenPhrases,
          skipForbiddenCheck: true,
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

      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        text: out.text,
        constitutionSha256: core.constitutionSha256,
        forbiddenPhrases,
      });
    } catch (e) {
      console.error('[app_mention]', e);
      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        text: `처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.\n(${formatErr(e)})`,
        constitutionSha256: core.constitutionSha256,
        forbiddenPhrases,
        skipForbiddenCheck: true,
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

      await sendFounderResponse({
        client,
        channel: event.channel,
        thread_ts: event.thread_ts || undefined,
        text: out.text,
        constitutionSha256: core.constitutionSha256,
        forbiddenPhrases,
      });
    } catch (e) {
      console.error('[dm]', e);
      if (event.channel) {
        await sendFounderResponse({
          client,
          channel: event.channel,
          thread_ts: event.thread_ts || undefined,
          text: `처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.\n(${formatErr(e)})`,
          constitutionSha256: core.constitutionSha256,
          forbiddenPhrases,
          skipForbiddenCheck: true,
        });
      }
    }
  });
}
