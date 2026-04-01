import { shouldSkipEvent } from './eventDedup.js';
import { sendFounderResponse } from '../core/founderOutbound.js';
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
import { logRouterEvent } from '../features/topLevelRouter.js';
import { founderRequestPipeline } from '../core/founderRequestPipeline.js';
import { isActiveProjectIntake, getProjectIntakeSession } from '../features/projectIntakeSession.js';

// FOUNDERRAWOUTBOUND_FORBIDDEN — all founder-facing sends go through sendFounderResponse

/**
 * @param {string|{ text: string, blocks?: object[], surface_type?: string, trace?: Record<string, unknown> }} answer
 * @returns {{ text: string, blocks?: object[], surface_type?: string, trace?: Record<string, unknown> }}
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
  if (plain) recordConversationTurn(key, 'assistant', plain);
}

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
        await sendFounderResponse({
          say,
          thread_ts: event.ts,
          rendered_text: '지시 내용을 함께 적어주세요.',
          surface_type: 'safe_fallback_surface',
        });
        return;
      }

      const meta = {
        source_type: 'channel_mention',
        slack_route_label: 'mention_ai_router',
        channel: event.channel,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts || null,
        event_id: body?.event_id || null,
        has_files: files.length > 0,
        file_count: files.length,
      };
      const founderPipelineResult = await founderRequestPipeline({
        text: combinedText,
        metadata: {
          ...meta,
          has_active_intake: isActiveProjectIntake(meta),
          intake_session: isActiveProjectIntake(meta) ? getProjectIntakeSession(meta) : null,
        },
        route_label: meta.slack_route_label,
      });
      const answer = founderPipelineResult ?? {
        text: '[COS] founder front door는 전략 대화/상태/승인/배포/메타 경로만 처리합니다. 조회/구조화 명령은 접두어로 입력해 주세요.',
        surface_type: 'safe_fallback_surface',
      };
      recordInboundSlackExchange(meta, combinedText, answer);

      const payload = resolvePostPayload(answer);
      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        rendered_text: payload.text,
        rendered_blocks: payload.blocks,
        surface_type: payload.surface_type || 'safe_fallback_surface',
        trace: { route_label: 'mention_ai_router', ...(payload.trace || {}) },
      });
    } catch (error) {
      console.error('APP_MENTION_ERROR:', error);
      await sendFounderResponse({
        say,
        thread_ts: event.ts,
        rendered_text: `에러가 발생했습니다.\n${formatError(error)}`,
        surface_type: 'exception_surface',
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
        slack_route_label: 'dm_ai_router',
        channel: event.channel,
        user: event.user,
        ts: event.ts,
        thread_ts: event.thread_ts || null,
        event_id: body?.event_id || null,
        has_files: files.length > 0,
        file_count: files.length,
      };
      const founderPipelineResult = await founderRequestPipeline({
        text: combinedText,
        metadata: {
          ...meta,
          has_active_intake: isActiveProjectIntake(meta),
          intake_session: isActiveProjectIntake(meta) ? getProjectIntakeSession(meta) : null,
        },
        route_label: meta.slack_route_label,
      });
      const answer = founderPipelineResult ?? {
        text: '[COS] founder front door는 전략 대화/상태/승인/배포/메타 경로만 처리합니다. 조회/구조화 명령은 접두어로 입력해 주세요.',
        surface_type: 'safe_fallback_surface',
      };
      recordInboundSlackExchange(meta, combinedText, answer);

      const payload = resolvePostPayload(answer);
      await sendFounderResponse({
        client,
        channel: event.channel,
        rendered_text: payload.text,
        rendered_blocks: payload.blocks,
        surface_type: payload.surface_type || 'safe_fallback_surface',
        trace: { route_label: 'dm_ai_router', ...(payload.trace || {}) },
      });
    } catch (error) {
      console.error('DM_ERROR:', error);

      if (event?.channel) {
        await sendFounderResponse({
          client,
          channel: event.channel,
          rendered_text: `에러가 발생했습니다.\n${formatError(error)}`,
          surface_type: 'exception_surface',
        });
      }
    }
  });

  // Interactive approval buttons
  const approvalActionPattern = /^approval_\d+_(approve|hold|reject|detail)$/;
  const actionIdToIntent = { approve: '승인', hold: '보류', reject: '폐기', detail: '상세' };

  slackApp.action(approvalActionPattern, async ({ ack, body, action, client }) => {
    try {
      await ack();
      logRouterEvent('slack_interactive_route', { route: 'approval_queue', action_id: action?.action_id });

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
        await sendFounderResponse({
          client,
          channel,
          thread_ts,
          rendered_text: formatApprovalDetail(item),
          surface_type: 'approval_packet_surface',
          trace: { route_label: 'approval_detail_button' },
        });
        return;
      }

      const result = await updateApprovalStatus(
        payload.approvalId,
        intent,
        '',
        { approved_by: body?.user?.id, source: body }
      );

      await sendFounderResponse({
        client,
        channel,
        thread_ts,
        rendered_text: formatApprovalUpdate(result),
        surface_type: 'approval_packet_surface',
        trace: { route_label: 'approval_update_button' },
      });
    } catch (error) {
      console.error('APPROVAL_BUTTON_ERROR:', error);
    }
  });

  // Execution deploy approval buttons
  const execDeployActionPattern = /^g1cos_exec_deploy_(approve|rework|hold)$/;
  const execDeployIntentMap = { approve: 'approve', rework: 'rework', hold: 'hold' };

  slackApp.action(execDeployActionPattern, async ({ ack, body, action, client }) => {
    try {
      await ack();
      logRouterEvent('slack_interactive_route', { route: 'execution_button', action_id: action?.action_id });
      const { applyApprovalDecision } = await import('../features/executionSpineRouter.js');
      const { getExecutionRunById } = await import('../features/executionRun.js');

      const intent = execDeployIntentMap[action.action_id?.match(execDeployActionPattern)?.[1]];
      if (!intent) return;

      let payload = null;
      try { payload = JSON.parse(action?.value || '{}'); } catch { payload = {}; }
      const runId = payload?.run_id;
      if (!runId) return;

      const run = getExecutionRunById(runId);
      if (!run) return;

      const result = applyApprovalDecision(run, intent, '');
      const channel = body?.channel?.id;
      const thread_ts = body?.container?.thread_ts || body?.message?.ts || undefined;

      await sendFounderResponse({
        client,
        channel,
        thread_ts,
        rendered_text: result.response_text,
        surface_type: 'deploy_packet_surface',
        trace: { route_label: 'exec_deploy_button' },
      });
    } catch (error) {
      console.error('EXEC_DEPLOY_BUTTON_ERROR:', error);
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

      await sendFounderResponse({
        client,
        channel,
        thread_ts,
        rendered_text: msg,
        surface_type: 'structured_command_surface',
        trace: { route_label: 'dialog_queue_button' },
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

  // Query nav buttons
  slackApp.action(/^g1cos_query_nav_\d+$/, async ({ ack, body, action, client }) => {
    try {
      await ack();

      const queryLine = action?.value;
      if (!queryLine || typeof queryLine !== 'string') return;

      const trimmed = normalizeSlackUserPayload(queryLine.trim());
      if (!trimmed) return;

      logRouterEvent('slack_interactive_route', { route: 'query_nav_button' });

      const routerCtx = {
        raw_text: `[query_nav_button] ${queryLine}`,
        normalized_text: trimmed,
        slack_route_label: 'query_nav_button',
      };

      const out = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
      if (out == null) return;

      const channel = body?.channel?.id;
      if (!channel) return;

      const thread_ts =
        body?.message?.thread_ts || body?.message?.ts || body?.container?.thread_ts || undefined;

      const payload = resolvePostPayload(out);
      await sendFounderResponse({
        client,
        channel,
        thread_ts,
        rendered_text: payload.text,
        rendered_blocks: payload.blocks,
        surface_type: 'query_surface',
        trace: { route_label: 'query_nav_button' },
      });
    } catch (error) {
      console.error('QUERY_NAV_BUTTON_ERROR:', error);
    }
  });
}
