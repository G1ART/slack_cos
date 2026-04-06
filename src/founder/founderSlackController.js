/**
 * vNext.13.14 — 창업자 Slack 멘션/DM 전용 컨트롤러.
 * 레거시 앱 텍스트 진입점·라우터를 거치지 않고 `runFounderDirectKernel`만 호출한다.
 */

import {
  founderIngestSlackFilesWithState,
  buildFounderTurnAfterFileIngest,
  buildCurrentAttachmentMetaFromIngest,
  formatFounderFileFailureOnlyMessage,
} from '../features/founderSlackFileTurn.js';
import { summarizePngBufferForFounderDm } from '../features/founderDmImageSummary.js';
import { runFounderDirectKernel } from './founderDirectKernel.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';
import { FounderSurfaceType } from '../core/founderContracts.js';
import { isFounderStagingModeEnabled } from './founderArtifactGate.js';

const PIPELINE_VERSION = 'vNext.13.14.founder_spine';

function founderPreflightTrace() {
  return {
    founder_staging_mode: isFounderStagingModeEnabled(),
    founder_preflight_boundary: true,
  };
}

/**
 * @param {{
 *   rawText: string,
 *   files?: object[],
 *   client: object,
 *   event: Record<string, unknown>,
 *   body?: Record<string, unknown>,
 *   routeLabel: string,
 *   callText?: Function,
 *   has_active_intake?: boolean,
 *   intake_session?: unknown,
 * }} ctx
 * @returns {Promise<{
 *   text: string,
 *   blocks?: object[],
 *   surface_type: string,
 *   trace: Record<string, unknown>,
 *   slackMetadata: Record<string, unknown>,
 *   inboundTextForBuffer: string,
 *   attachment_ingest_success_count: number,
 *   attachment_ingest_failure_count: number,
 * }>}
 */
export async function handleFounderSlackTurn({
  rawText,
  files = [],
  client,
  event,
  body,
  routeLabel,
  callText,
  has_active_intake = false,
  intake_session = null,
}) {
  const source_type = event.channel_type === 'im' ? 'direct_message' : 'channel_mention';
  const threadKey = buildSlackThreadKey({
    channel: event.channel,
    ts: event.ts,
    thread_ts: event.thread_ts || event.ts,
    source_type,
  });

  const ingestResults = files.length
    ? await founderIngestSlackFilesWithState({
        files,
        client,
        threadKey,
        summarizePng: summarizePngBufferForFounderDm,
        persistToFounderState: false,
        persistToDocumentContext: false,
      })
    : [];

  const isDm = source_type === 'direct_message';
  for (const result of ingestResults) {
    if (result?.ok) {
      console.info(
        JSON.stringify(
          isDm
            ? {
                event: 'slack_file_ingested',
                file_id: result.file_id,
                filename: result.filename,
                chars: result.char_count,
              }
            : { event: 'slack_file_ingested', file_id: result.file_id, filename: result.filename },
        ),
      );
    } else {
      console.warn(
        JSON.stringify(
          isDm
            ? {
                event: 'slack_file_ingest_failed',
                file_id: result.file_id,
                filename: result.filename,
                errorCode: result.errorCode,
              }
            : { event: 'slack_file_ingest_failed', file_id: result.file_id, errorCode: result.errorCode },
        ),
      );
    }
  }

  const turn = buildFounderTurnAfterFileIngest(ingestResults, rawText);
  const attachmentMeta = buildCurrentAttachmentMetaFromIngest(ingestResults);
  const successCount = ingestResults.filter((x) => x?.ok).length;
  const failureCount = ingestResults.filter((x) => x && !x.ok).length;

  const slackMetadata = {
    founder_route: true,
    slack_route_label: routeLabel || null,
    source_type,
    channel: event.channel,
    user: event.user,
    ts: event.ts,
    thread_ts: event.thread_ts || null,
    event_id: body?.event_id || null,
    has_files: files.length > 0,
    file_count: files.length,
    attachment_ingest_success_count: successCount,
    attachment_ingest_failure_count: failureCount,
    failure_notes: turn.failureNotes || [],
    has_active_intake,
    intake_session,
    callText: typeof callText === 'function' ? callText : null,
    ...attachmentMeta,
  };

  const inboundTextForBuffer = String(turn.modelUserText || rawText || '').trim();

  if (turn.canShortCircuitFailure) {
    const msg = formatFounderFileFailureOnlyMessage(turn.failureNotes);
    return {
      text: msg,
      blocks: undefined,
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      trace: {
        surface_type: FounderSurfaceType.PARTNER_NATURAL,
        route_label: routeLabel || null,
        responder_kind: 'founder_kernel',
        responder: 'founder_kernel',
        founder_direct_kernel: true,
        founder_conversation_path: true,
        founder_path: 'attachment_failure_short_circuit',
        founder_step: 'no_llm_file_failure_only',
        pipeline_version: PIPELINE_VERSION,
        founder_surface_source: 'attachment_failure_only',
        founder_legacy_world_bypassed: true,
        handle_user_text_bypassed: true,
        egress_contract_required: true,
        transcript_ready: false,
        founder_transcript_injected: false,
        ...founderPreflightTrace(),
      },
      slackMetadata,
      inboundTextForBuffer,
      attachment_ingest_success_count: successCount,
      attachment_ingest_failure_count: failureCount,
    };
  }

  const kernelAnswer = await runFounderDirectKernel({
    text: turn.modelUserText || String(rawText || '').trim(),
    metadata: slackMetadata,
    route_label: routeLabel || null,
  });

  return {
    text: kernelAnswer.text,
    blocks: kernelAnswer.blocks,
    surface_type: kernelAnswer.surface_type || kernelAnswer.trace?.surface_type || FounderSurfaceType.PARTNER_NATURAL,
    trace: kernelAnswer.trace && typeof kernelAnswer.trace === 'object' ? { ...kernelAnswer.trace } : {},
    slackMetadata,
    inboundTextForBuffer,
    attachment_ingest_success_count: successCount,
    attachment_ingest_failure_count: failureCount,
  };
}
