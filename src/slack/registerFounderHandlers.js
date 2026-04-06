/**
 * vNext.13.16 — 창업자 면 전용: app_mention + DM(message). 레거시 라우터·승인·slash 없음.
 */

import { shouldSkipEvent } from './eventDedup.js';
import { sendFounderResponse } from '../core/founderOutbound.js';
import { getInboundCommandText } from './inboundText.js';
import { buildSlackThreadKey, recordConversationTurn } from '../features/slackConversationBuffer.js';
import { extractFilesFromEvent } from '../features/slackFileIntake.js';
import { handleFounderSlackTurn } from '../founder/founderSlackController.js';

function founderEgressMetadata(trace, egressCaller) {
  const t = trace && typeof trace === 'object' ? trace : {};
  return {
    founder_route: true,
    founder_surface_source: String(t.founder_surface_source || 'direct_cos_chat').trim() || 'direct_cos_chat',
    pipeline_version: String(t.pipeline_version || 'vNext.13.16.constitution_only').trim(),
    egress_caller: egressCaller,
  };
}

/**
 * @param {string|{ text: string, blocks?: object[], surface_type?: string, trace?: Record<string, unknown> }} answer
 */
function resolvePostPayload(answer) {
  if (typeof answer === 'string') return { text: answer };
  return { text: answer?.text || '', blocks: answer?.blocks, surface_type: answer?.surface_type, trace: answer?.trace };
}

function recordInboundSlackExchange(metadata, userInboundText, answer) {
  const key = buildSlackThreadKey(metadata);
  const u = String(userInboundText || '').trim();
  const plain = resolvePostPayload(answer).text?.trim() || '';
  if (u) recordConversationTurn(key, 'user', u);
  if (!metadata?.founder_route && plain) {
    recordConversationTurn(key, 'assistant', plain);
  }
}

/**
 * @param {import('@slack/bolt').App} slackApp
 * @param {{
 *   formatError: (e: unknown) => string,
 *   callText: (opts: { instructions: string, input: string }) => Promise<string>,
 *   constitutionMarkdown: string,
 *   forbiddenSubstrings: string[],
 * }} ctx
 */
export function registerFounderHandlers(slackApp, { formatError, callText, constitutionMarkdown, forbiddenSubstrings }) {
  slackApp.event('app_mention', async ({ body, event, say, client }) => {
    try {
      if (shouldSkipEvent(body, event)) {
        return;
      }

      const userText = getInboundCommandText(event) || '';
      const files = extractFilesFromEvent(event);

      if (!userText.trim() && files.length === 0) {
        const emptyTrace = {
          route_label: 'mention_founder',
          founder_surface_source: 'empty_prompt_guard',
          pipeline_version: 'vNext.13.16.constitution_only',
        };
        await sendFounderResponse({
          say,
          thread_ts: event.ts,
          rendered_text: '지시 내용을 함께 적어주세요.',
          surface_type: 'safe_fallback_surface',
          trace: emptyTrace,
          metadata: founderEgressMetadata(emptyTrace, 'registerFounderHandlers_mention_empty'),
          forbiddenSubstrings,
        });
        return;
      }

      const out = await handleFounderSlackTurn({
        rawText: userText,
        files,
        client,
        body,
        event,
        routeLabel: 'mention_founder',
        callText,
        constitutionMarkdown,
      });

      recordInboundSlackExchange(out.slackMetadata, out.inboundTextForBuffer || userText, {
        text: out.text,
        trace: out.trace,
      });

      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        rendered_text: out.text,
        rendered_blocks: out.blocks,
        surface_type: out.surface_type || out.trace?.surface_type || 'safe_fallback_surface',
        trace: {
          route_label: 'mention_founder',
          attachment_ingest_success_count: out.attachment_ingest_success_count,
          attachment_ingest_failure_count: out.attachment_ingest_failure_count,
          ...out.trace,
        },
        metadata: founderEgressMetadata(out.trace, 'handleFounderSlackTurn'),
        forbiddenSubstrings,
      });
    } catch (error) {
      console.error('APP_MENTION_ERROR:', error);
      const exTrace = {
        route_label: 'mention_founder',
        founder_surface_source: 'exception_handler',
        pipeline_version: 'vNext.13.16.constitution_only',
        error_code: error?.code ?? null,
      };
      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        rendered_text: `에러가 발생했습니다.\n${formatError(error)}`,
        surface_type: 'exception_surface',
        trace: exTrace,
        metadata: founderEgressMetadata(exTrace, 'registerFounderHandlers_mention_catch'),
        forbiddenSubstrings,
      });
    }
  });

  slackApp.event('message', async ({ body, event, client }) => {
    try {
      if (event.channel_type !== 'im') return;
      if (event.subtype && event.subtype !== 'file_share') return;
      if (event.bot_id) return;
      if (shouldSkipEvent(body, event)) return;

      const dmText = getInboundCommandText(event) || '';
      const files = extractFilesFromEvent(event);

      if (!dmText.trim() && files.length === 0) return;

      const out = await handleFounderSlackTurn({
        rawText: dmText,
        files,
        client,
        body,
        event,
        routeLabel: 'dm_founder',
        callText,
        constitutionMarkdown,
      });

      recordInboundSlackExchange(out.slackMetadata, out.inboundTextForBuffer || dmText, {
        text: out.text,
        trace: out.trace,
      });

      await sendFounderResponse({
        client,
        channel: event.channel,
        thread_ts: event.thread_ts || undefined,
        rendered_text: out.text,
        rendered_blocks: out.blocks,
        surface_type: out.surface_type || out.trace?.surface_type || 'safe_fallback_surface',
        trace: {
          route_label: 'dm_founder',
          attachment_ingest_success_count: out.attachment_ingest_success_count,
          attachment_ingest_failure_count: out.attachment_ingest_failure_count,
          ...out.trace,
        },
        metadata: founderEgressMetadata(out.trace, 'handleFounderSlackTurn'),
        forbiddenSubstrings,
      });
    } catch (error) {
      console.error('DM_ERROR:', error);

      if (event?.channel) {
        const exTrace = {
          route_label: 'dm_founder',
          founder_surface_source: 'exception_handler',
          pipeline_version: 'vNext.13.16.constitution_only',
          error_code: error?.code ?? null,
        };
        await sendFounderResponse({
          client,
          channel: event.channel,
          thread_ts: event.thread_ts || undefined,
          rendered_text: `에러가 발생했습니다.\n${formatError(error)}`,
          surface_type: 'exception_surface',
          trace: exTrace,
          metadata: founderEgressMetadata(exTrace, 'registerFounderHandlers_dm_catch'),
          forbiddenSubstrings,
        });
      }
    }
  });
}
