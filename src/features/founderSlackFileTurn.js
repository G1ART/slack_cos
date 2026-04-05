/**
 * vNext.13.7 — 창업자 DM/멘션: 파일 인제스트와 planner 입력 분리 (실패 재주입 금지).
 */

import {
  ingestSlackFile,
  buildConciseFileContextForPlanner,
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
    const result = await ingestSlackFile({ file, client, summarizePng });
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
 * @param {object[]} results
 * @param {string} userText
 * @returns {{ combinedTextForPlanner: string, failureNotes: string[], skipPlanner: boolean }}
 */
export function buildFounderPlannerInputAfterFileIngest(results, userText) {
  const part = partitionFileIntakeForFounderTurn(results, userText);
  const ut = String(userText || '').trim();
  const concise = buildConciseFileContextForPlanner(part.successes);
  const failureNotes = part.failures.map((f) => formatFounderFacingFileFailure(f));

  if (part.skipPlannerEntirely) {
    return {
      combinedTextForPlanner: '',
      failureNotes,
      skipPlanner: true,
    };
  }

  const combinedTextForPlanner = (ut + concise).trim();
  return {
    combinedTextForPlanner,
    failureNotes,
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
