/**
 * vNext.13.7 — 창업자 DM/멘션: 파일 인제스트와 planner 입력 분리 (실패 재주입 금지).
 * vNext.13.9 — 모델 userText 는 대표 원문만; 실패는 failure_notes·컨텍스트 sidecar만.
 */

import {
  ingestSlackFile,
  partitionFileIntakeForFounderTurn,
  formatFounderFacingFileFailure,
} from './slackFileIntake.js';
import { buildFounderFileContextEntry } from '../founder/founderFileContextRecord.js';
import { mergeFounderConversationState } from '../founder/founderConversationState.js';
import { addDocumentToThread } from './slackDocumentContext.js';
import { FounderSurfaceType } from '../core/founderContracts.js';

/**
 * @param {{
 *   files: object[],
 *   client: object,
 *   threadKey: string,
 *   summarizePng: Function,
 * }} ctx
 * @returns {Promise<object[]>}
 */
export async function founderIngestSlackFilesWithState(ctx) {
  const { files, client, threadKey, summarizePng } = ctx;
  const results = [];
  for (const file of files) {
    const result = await ingestSlackFile({ file, client, summarizePng, threadKey });
    try {
      await mergeFounderConversationState(threadKey, {
        latest_file_contexts: [buildFounderFileContextEntry(threadKey, result)],
      });
    } catch (e) {
      console.warn('[founderSlackFileTurn] mergeFounderConversationState:', e?.message || e);
    }
    if (result.ok) {
      addDocumentToThread(threadKey, result);
    }
    results.push(result);
  }
  return results;
}

/**
 * vNext.13.9 — 대표 원문만 `modelUserText`; 성공 파일은 sidecar(`latest_file_contexts` 등)로만;
 * 실패는 `failureNotes`(메타) + short-circuit 시 LLM 없음.
 * @param {object[]} results
 * @param {string} userText
 * @returns {{
 *   modelUserText: string,
 *   fileContextEntries: object[],
 *   failureNotes: string[],
 *   canShortCircuitFailure: boolean,
 * }}
 */
export function buildFounderTurnAfterFileIngest(results, userText) {
  const part = partitionFileIntakeForFounderTurn(results, userText);
  const ut = String(userText || '').trim();
  const failureNotes = part.failures.map((f) => formatFounderFacingFileFailure(f));
  const successes = part.successes;
  const fileContextEntries = successes.map((s) => ({
    file_id: s.file_id ?? null,
    filename: s.filename ?? 'unknown',
    mime_type: s.mimetype ?? null,
    summary: String(s.summary ?? s.text ?? '').trim().slice(0, 4000),
    extract_status: s.truncated ? 'partial' : 'ok',
  }));
  const canShortCircuitFailure = !ut && successes.length === 0 && failureNotes.length > 0;
  return {
    modelUserText: ut,
    fileContextEntries,
    failureNotes,
    canShortCircuitFailure,
  };
}

/**
 * @deprecated vNext.13.9 — `buildFounderTurnAfterFileIngest` 사용. 본 필드는 `modelUserText`와 동일 의미만 유지.
 */
export function buildFounderTurnTextAfterFileIngest(results, userText) {
  const t = buildFounderTurnAfterFileIngest(results, userText);
  return {
    combinedTextForPlanner: t.modelUserText,
    failureNotes: t.failureNotes,
  };
}

/**
 * @deprecated `skipPlanner`는 항상 false; short-circuit 은 `canShortCircuitFailure` + 핸들러에서 처리.
 */
export function buildFounderPlannerInputAfterFileIngest(results, userText) {
  const r = buildFounderTurnAfterFileIngest(results, userText);
  return {
    combinedTextForPlanner: r.modelUserText,
    failureNotes: r.failureNotes,
    skipPlanner: false,
  };
}

/**
 * @param {string[]} failureNotes
 * @returns {string}
 */
export function formatFounderFileFailureOnlyMessage(failureNotes) {
  const lines = (failureNotes || []).filter(Boolean);
  if (lines.length === 0) return '첨부를 읽지 못했습니다. 잠시 후 다시 시도하거나 본문을 붙여 주세요.';
  if (lines.length === 1) return lines[0];
  return `첨부를 모두 읽지 못했습니다.\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
}

export const FOUNDER_FILE_FAILURE_SURFACE = FounderSurfaceType.PARTNER_NATURAL;
