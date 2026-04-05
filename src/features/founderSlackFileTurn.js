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
 * vNext.13.8 — 파일 성공/실패 모두 동일 founder 모델 경로 입력으로만 조립 (라우팅 분기 없음).
 * @param {object[]} results
 * @param {string} userText
 * @returns {{ combinedTextForPlanner: string, failureNotes: string[] }}
 */
export function buildFounderTurnTextAfterFileIngest(results, userText) {
  const part = partitionFileIntakeForFounderTurn(results, userText);
  const ut = String(userText || '').trim();
  const concise = buildConciseFileContextForPlanner(part.successes);
  const failureNotes = part.failures.map((f) => formatFounderFacingFileFailure(f));
  const failureBlock = failureNotes.length
    ? `\n\n(첨부 처리 안내 — 참고)\n${failureNotes.join('\n')}`
    : '';

  if (!ut && !concise.trim() && failureNotes.length) {
    return {
      combinedTextForPlanner: `(첨부만 전송됨)${failureBlock}\n\n대표 본문이 비어 있어 첨부 처리 결과만 전달합니다. 원하시는 내용을 한 줄이라도 적어 주시면 이어서 도와드리겠습니다.`,
      failureNotes,
    };
  }

  return {
    combinedTextForPlanner: (ut + concise + failureBlock).trim(),
    failureNotes,
  };
}

/**
 * @deprecated Prefer `buildFounderTurnTextAfterFileIngest`. `skipPlanner`는 항상 false (vNext.13.8).
 */
export function buildFounderPlannerInputAfterFileIngest(results, userText) {
  const r = buildFounderTurnTextAfterFileIngest(results, userText);
  return { ...r, skipPlanner: false };
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
