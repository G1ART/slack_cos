/**
 * vNext.13.16 — 창업자 Slack 멘션/DM: 현재 턴 텍스트·첨부만 운반, 의미 분류 없음.
 */

import {
  founderIngestSlackFilesWithState,
  buildFounderTurnAfterFileIngest,
  buildCurrentAttachmentMetaFromIngest,
  formatFounderFileFailureOnlyMessage,
} from '../features/founderSlackFileTurn.js';
import { summarizePngBufferForFounderDm } from '../features/founderDmImageSummary.js';
import { runFounderDirectConversation } from './founderDirectConversation.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';
import { FounderSurfaceType } from '../core/founderSurfacesMinimal.js';
import { isFounderStagingModeEnabled } from './founderArtifactGate.js';

const PIPELINE_VERSION = 'vNext.13.16.constitution_only';

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
 *   callText: Function,
 *   constitutionMarkdown: string,
 * }} ctx
 */
export async function handleFounderSlackTurn({
  rawText,
  files = [],
  client,
  event,
  body,
  routeLabel,
  callText,
  constitutionMarkdown,
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
        responder_kind: 'founder_cos',
        founder_direct_conversation: false,
        founder_step: 'attachment_failure_short_circuit',
        pipeline_version: PIPELINE_VERSION,
        founder_surface_source: 'attachment_failure_only',
        founder_legacy_world_bypassed: true,
        handle_user_text_bypassed: true,
        egress_contract_required: true,
        ...founderPreflightTrace(),
      },
      slackMetadata,
      inboundTextForBuffer,
      attachment_ingest_success_count: successCount,
      attachment_ingest_failure_count: failureCount,
    };
  }

  const kernelAnswer = await runFounderDirectConversation({
    callText,
    constitutionMarkdown,
    userText: turn.modelUserText || String(rawText || '').trim(),
    metadata: slackMetadata,
  });

  return {
    text: kernelAnswer.text,
    blocks: kernelAnswer.blocks,
    surface_type: kernelAnswer.surface_type || FounderSurfaceType.PARTNER_NATURAL,
    trace: { ...kernelAnswer.trace, ...founderPreflightTrace(), route_label: routeLabel || null },
    slackMetadata,
    inboundTextForBuffer,
    attachment_ingest_success_count: successCount,
    attachment_ingest_failure_count: failureCount,
  };
}
