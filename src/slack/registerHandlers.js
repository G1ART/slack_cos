import { shouldSkipEvent } from './eventDedup.js';
import { replyInThread } from './reply.js';
import { getInboundCommandText } from './inboundText.js';
import { buildSlackThreadKey, recordConversationTurn } from '../features/slackConversationBuffer.js';
import { extractFilesFromEvent, ingestSlackFile, formatFileIngestError } from '../features/slackFileIntake.js';
import { addDocumentToThread } from '../features/slackDocumentContext.js';
import {
  updateApprovalStatus,
  formatApprovalUpdate,
  getApprovalByInternalId,
  formatApprovalDetail,
} from '../features/approvals.js';
import { tryFinalizeSlackQueryRoute } from '../features/queryOnlyRoute.js';
import { normalizeSlackUserPayload } from './slackTextNormalize.js';
import { appendWorkspaceQueueItem, formatWorkspaceQueueSaved } from '../features/cosWorkspaceQueue.js';
import { getChannelContext } from '../storage/channelContext.js';
import { decodeDialogQueuePayload } from './dialogQueueConfirmBlocks.js';

/**
 * @param {string|{ text: string, blocks?: object[] }} answer
 * @returns {{ text: string, blocks?: object[] }}
 */
function resolvePostPayload(answer) {
  if (typeof answer === 'string') return { text: answer };
  return { text: answer?.text || '', blocks: answer?.blocks };
}

/** 플래너·조회 등 app.js 직접 반환까지 스레드 버퍼에 남겨, 후속 dialog 가 PLN 맥락을 본다. */
function recordInboundSlackExchange(metadata, userInboundText, answer) {
  const key = buildSlackThreadKey(metadata);
  const u = String(userInboundText || '').trim();
  const plain = resolvePostPayload(answer).text?.trim() || '';
  if (u) recordConversationTurn(key, 'user', u);
  if (plain) recordConversationTurn(key, 'assistant', plain);
}

/** Slack blocks 검증/전송 실패 시 텍스트만 재시도할지 여부 */
function isBlocksValidationError(error) {
  const msg = error?.message || String(error);
  return (
    /action_id.*already exists/i.test(msg) ||
    /invalid_blocks/i.test(msg) ||
    /block_kit/i.test(msg)
  );
}

/**
 * Slack 텍스트 진입 (`app.js` 의 `handleUserText` → `runInboundCommandRouter` + `runInboundAiRouter`):
 * - app_mention: 채널에서 @봇 멘션
 * - message: DM(channel_type===im) 만. 일반 채널에서 멘션 없이내면 이 앱은 이벤트를 받지 않음.
 * - (별도) **`/g1cos`** 슬래시: `registerSlashCommands.js` — 조회·lineage; 응답 직후 **`recordSlashCommandExchange`**(DM은 `im:` 동일 키). 끄려면 `CONVERSATION_BUFFER_RECORD_SLASH=0`.
 */
export function registerHandlers(slackApp, { handleUserText, formatError }) {
  slackApp.event('app_mention', async ({ body, event, say, client }) => {
    try {
      if (shouldSkipEvent(body, event)) {
        return;
      }

      const userText = getInboundCommandText(event) || '';

      const files = extractFilesFromEvent(event);
      let fileContext = '';
      if (files.length) {
        const tk = buildSlackThreadKey({
          channel: event.channel,
          ts: event.ts,
          thread_ts: event.thread_ts,
        });
        for (const file of files) {
          const result = await ingestSlackFile({ file, client });
          if (result.ok) {
            addDocumentToThread(tk, result);
            fileContext += `\n\n[첨부 파일: ${result.filename}]\n${result.text}`;
          } else {
            fileContext += `\n\n[파일 인제스트 실패: ${result.filename}] ${formatFileIngestError(result)}`;
          }
        }
      }

      const combinedText = (userText + fileContext).trim();
      if (!combinedText) {
        await replyInThread(say, event.ts, '지시 내용을 함께 적어주세요.');
        return;
      }

      const meta = {
        source_type: 'channel_mention',
        channel: event.channel,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts || null,
        event_id: body?.event_id || null,
        has_files: files.length > 0,
        file_count: files.length,
      };
      const answer = await handleUserText(combinedText, meta);
      recordInboundSlackExchange(meta, combinedText, answer);

      try {
        await replyInThread(say, event.ts, answer);
      } catch (err) {
        if (isBlocksValidationError(err) && typeof answer === 'object' && answer?.blocks) {
          console.warn(
            'SLACK_BLOCKS_FALLBACK (app_mention): posting text only; original error:',
            err?.message || err
          );
          await replyInThread(say, event.ts, answer.text || '');
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('APP_MENTION_ERROR:', error);
      await replyInThread(
        say,
        event.ts,
        `에러가 발생했습니다.\n${formatError(error)}`
      );
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
      let fileContext = '';
      const threadKey = buildSlackThreadKey({
        channel: event.channel,
        ts: event.ts,
        thread_ts: event.thread_ts,
      });

      for (const file of files) {
        const result = await ingestSlackFile({ file, client });
        if (result.ok) {
          addDocumentToThread(threadKey, result);
          fileContext += `\n\n[첨부 파일: ${result.filename}]\n${result.text}`;
          console.info(JSON.stringify({ event: 'slack_file_ingested', file_id: result.file_id, filename: result.filename, chars: result.char_count }));
        } else {
          fileContext += `\n\n[파일 인제스트 실패: ${result.filename}] ${formatFileIngestError(result)}`;
          console.warn(JSON.stringify({ event: 'slack_file_ingest_failed', file_id: result.file_id, filename: result.filename, errorCode: result.errorCode }));
        }
      }

      const combinedText = (dmText + fileContext).trim();
      if (!combinedText) return;

      const meta = {
        source_type: 'direct_message',
        channel: event.channel,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts || null,
        event_id: body?.event_id || null,
        has_files: files.length > 0,
        file_count: files.length,
      };
      const answer = await handleUserText(combinedText, meta);
      recordInboundSlackExchange(meta, combinedText, answer);

      const payload = resolvePostPayload(answer);
      try {
        await client.chat.postMessage({
          channel: event.channel,
          ...payload,
        });
      } catch (err) {
        if (isBlocksValidationError(err) && payload.blocks) {
          console.warn(
            'SLACK_BLOCKS_FALLBACK (dm): posting text only; original error:',
            err?.message || err
          );
          await client.chat.postMessage({
            channel: event.channel,
            text: payload.text || '',
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('DM_ERROR:', error);

      if (event?.channel) {
        await client.chat.postMessage({
          channel: event.channel,
          text: `에러가 발생했습니다.\n${formatError(error)}`,
        });
      }
    }
  });

  // Interactive approval buttons (action_id: approval_<index>_approve | hold | reject | detail)
  const approvalActionPattern = /^approval_\d+_(approve|hold|reject|detail)$/;
  const actionIdToIntent = { approve: '승인', hold: '보류', reject: '폐기', detail: '상세' };

  slackApp.action(approvalActionPattern, async ({ ack, body, action, client }) => {
    try {
      await ack();

      const payloadRaw = action?.value;
      if (!payloadRaw) return;

      let payload = null;
      try {
        payload = JSON.parse(payloadRaw);
      } catch {
        payload = null;
      }
      if (!payload?.approvalId) return;

      const intent = actionIdToIntent[action.action_id?.match(approvalActionPattern)?.[1]] || null;
      if (!intent) return;

      const channel = body?.channel?.id;
      const thread_ts = body?.container?.thread_ts || body?.message?.ts || undefined;

      if (intent === '상세') {
        const item = await getApprovalByInternalId(payload.approvalId);
        if (!item) return;
        const text = formatApprovalDetail(item);
        await client.chat.postMessage({
          channel,
          text,
          ...(thread_ts ? { thread_ts } : {}),
        });
        return;
      }

      const result = await updateApprovalStatus(
        payload.approvalId,
        intent,
        '',
        { approved_by: body?.user?.id, source: body }
      );
      const text = formatApprovalUpdate(result);

      await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
    } catch (error) {
      console.error('APPROVAL_BUTTON_ERROR:', error);
    }
  });

  async function handleDialogQueueButton({ ack, body, action, client, kind }) {
    try {
      await ack();
      const channel = body?.channel?.id;
      const user = body?.user?.id;
      if (!channel || !user) return;

      const thread_ts = body?.message?.thread_ts || body?.message?.ts || undefined;

      if (kind === 'skip') {
        await client.chat.postEphemeral({
          channel,
          user,
          ...(thread_ts ? { thread_ts } : {}),
          text: '알겠습니다. 이번 말은 큐에 올리지 않았습니다.',
        });
        return;
      }

      const decoded = decodeDialogQueuePayload(action?.value);
      const bodyText = (decoded?.body || '').trim();
      if (!bodyText) {
        await client.chat.postEphemeral({
          channel,
          user,
          ...(thread_ts ? { thread_ts } : {}),
          text: '저장할 본문을 찾지 못했습니다. 같은 스레드에서 내용을 다시 보내 주세요.',
        });
        return;
      }

      const finalKind = kind === 'customer_feedback' ? 'customer_feedback' : 'spec_intake';
      const channelContext = await getChannelContext(channel).catch(() => null);
      const record = await appendWorkspaceQueueItem({
        kind: finalKind,
        body: bodyText,
        metadata: {
          user,
          source: 'slack_dialog_queue_button',
          action_id: action?.action_id,
          team_id: body?.team?.id,
        },
        channelContext,
      });

      let msg = formatWorkspaceQueueSaved(record, { natural: false });
      if (decoded?.tr) {
        msg +=
          '\n\n_참고: 원문이 길어 일부만 담겼을 수 있습니다. 전체는 `실행큐에 올려줘` + 다음 줄로 다시 내도 됩니다._';
      }

      await client.chat.postMessage({
        channel,
        ...(thread_ts ? { thread_ts } : {}),
        text: msg,
      });
    } catch (error) {
      console.error('DIALOG_QUEUE_BUTTON_ERROR:', error);
    }
  }

  slackApp.action('g1cos_dialog_queue_spec', async (args) =>
    handleDialogQueueButton({ ...args, kind: 'spec_intake' })
  );
  slackApp.action('g1cos_dialog_queue_feedback', async (args) =>
    handleDialogQueueButton({ ...args, kind: 'customer_feedback' })
  );
  slackApp.action('g1cos_dialog_queue_skip', async (args) =>
    handleDialogQueueButton({ ...args, kind: 'skip' })
  );

  // 조회 응답 하단 — 관련 조회 한 줄 (`action_id`: g1cos_query_nav_0 …)
  slackApp.action(/^g1cos_query_nav_\d+$/, async ({ ack, body, action, client }) => {
    try {
      await ack();

      const queryLine = action?.value;
      if (!queryLine || typeof queryLine !== 'string') return;

      const trimmed = normalizeSlackUserPayload(queryLine.trim());
      if (!trimmed) return;

      const routerCtx = {
        raw_text: `[query_nav_button] ${queryLine}`,
        normalized_text: trimmed,
      };

      const out = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
      if (out == null) return;

      const channel = body?.channel?.id;
      if (!channel) return;

      const thread_ts =
        body?.message?.thread_ts || body?.message?.ts || body?.container?.thread_ts || undefined;

      const payload = resolvePostPayload(out);
      try {
        await client.chat.postMessage({
          channel,
          ...(thread_ts ? { thread_ts } : {}),
          ...payload,
        });
      } catch (err) {
        if (isBlocksValidationError(err) && payload.blocks) {
          console.warn(
            'SLACK_BLOCKS_FALLBACK (query_nav_button): posting text only; original error:',
            err?.message || err
          );
          await client.chat.postMessage({
            channel,
            ...(thread_ts ? { thread_ts } : {}),
            text: payload.text || '',
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('QUERY_NAV_BUTTON_ERROR:', error);
    }
  });
}
