/**
 * Slack 인바운드 메시지에서 handleUserText용 평문 추출.
 * - event.text 가 비었거나 잘린 경우 blocks(rich_text 등)에서 본문 복원
 * - 멘션/채널/서브팀/특수 멘션 제거 (앞에 <!here> 등이 남으면 planner ^계획등록 매칭 실패)
 */

import {
  normalizeSlackCommandDecorations,
  normalizeSlackUserPayload,
} from './slackTextNormalize.js';
import {
  normalizePlannerInputForRoute,
  analyzePlannerResponderLock,
} from '../features/plannerRoute.js';

export { normalizeSlackCommandDecorations, normalizeSlackUserPayload };

/** @param {{ type: string }} lock */
function plannerLockRank(lock) {
  if (lock.type === 'hit') return 2;
  if (lock.type === 'miss') return 1;
  return 0;
}

/**
 * text vs blocks 중 하나만 선택될 때 `계획등록`이 누락되면 planner_lock 이 none 이 되어
 * AI 경로로 새는 문제를 막는다. 두 소스 각각에 대해 planner 잠금 강도가 더 높은 쪽을 채택.
 * @param {string} stripped stripSlackMarkupArtifacts(text)
 * @param {string} blockStripped stripSlackMarkupArtifacts(blocks)
 * @returns {string | null} normalizeSlackUserPayload 적용된 후보 (채택 시)
 */
function pickStrongerPlannerCandidate(stripped, blockStripped) {
  const cands = [];
  for (const x of [stripped, blockStripped]) {
    const t = String(x || '').trim();
    if (t) cands.push(t);
  }
  let bestRaw = null;
  let bestRank = -1;
  let bestLen = 0;
  for (const raw of cands) {
    const norm = normalizeSlackUserPayload(raw);
    const lock = analyzePlannerResponderLock(normalizePlannerInputForRoute(norm));
    const r = plannerLockRank(lock);
    const len = norm.length;
    if (r > bestRank || (r === bestRank && r > 0 && len > bestLen)) {
      bestRank = r;
      bestRaw = raw;
      bestLen = len;
    }
  }
  if (bestRank <= 0 || !bestRaw) return null;
  return normalizeSlackUserPayload(bestRaw);
}

function walkRichTextElements(elements, out) {
  if (!Array.isArray(elements)) return;
  for (const el of elements) {
    if (!el || typeof el !== 'object') continue;
    if (el.type === 'text' && el.text) out.push(el.text);
    if (el.type === 'link') {
      if (el.text) out.push(el.text);
      else if (el.url) out.push(el.url);
    }
    if (el.type === 'user' || el.type === 'usergroup' || el.type === 'channel') out.push(' ');
    if (Array.isArray(el.elements)) walkRichTextElements(el.elements, out);
  }
}

function flattenBlock(block, out) {
  if (!block || typeof block !== 'object') return;
  const t = block.type;
  if (t === 'section') {
    if (block.text?.text) out.push(block.text.text);
    if (Array.isArray(block.fields)) {
      for (const f of block.fields) {
        if (f?.text) out.push(f.text);
      }
    }
  }
  if (t === 'rich_text' && Array.isArray(block.elements)) {
    walkRichTextElements(block.elements, out);
  }
  if (t === 'context' && Array.isArray(block.elements)) {
    for (const el of block.elements) {
      if (el?.type === 'mrkdwn' && el.text) out.push(el.text);
      if (el?.type === 'plain_text' && el.text) out.push(el.text);
    }
  }
}

/**
 * @param {(import('@slack/types').KnownBlock | import('@slack/types').Block)[]} blocks
 */
export function flattenSlackBlocksToText(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return '';
  const out = [];
  for (const b of blocks) flattenBlock(b, out);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Slack mrkdwn 아티팩트 제거 (planner 등 prefix 매칭용)
 */
export function stripSlackMarkupArtifacts(s) {
  if (s == null) return '';
  let t = String(s);
  t = t.replace(/<@[^>]+>/g, '');
  t = t.replace(/<![^>]+>/g, ''); // <!here>, <!channel>, <!subteam^...>, <!date^...>
  t = t.replace(/<#[^|>]+(?:\|[^>]+)?>/g, ' ');
  t = t.replace(/<(https?:[^|>]+)\|[^>]+>/gi, '$1');
  t = t.replace(/<(https?:[^>]+)>/gi, '$1');
  return t.trim();
}

/**
 * text 필드에는 봇 멘션만 있고, 실제 명령어는 blocks(rich_text)에만 있는 경우가 많음.
 * 기존에는 `계획등록`만 특례 → query-only·기타 계획 명령이 Council 로 새는 원인이 됨.
 */
const INBOUND_PREFER_BLOCKS_MARKERS = [
  '계획등록',
  '계획상세',
  '계획발행목록',
  '계획진행',
  '계획작업목록',
  '계획승인',
  '계획기각',
  '계획발행',
  '계획시작',
  '계획완료',
  '계획차단',
  '계획변경',
  '계획요약',
  '업무상세',
  '업무검토',
];

function shouldPreferBlocksOverStripped(stripped, blockStripped) {
  if (!blockStripped || !stripped) return false;
  const sn = normalizeSlackUserPayload(stripped);
  const bn = normalizeSlackUserPayload(blockStripped);
  if (INBOUND_PREFER_BLOCKS_MARKERS.some((m) => bn.includes(m) && !sn.includes(m))) {
    return true;
  }
  if (
    sn.includes('계획등록') &&
    bn.includes('계획등록') &&
    bn.length > sn.length + 24
  ) {
    return true;
  }
  if (
    /계획\s*등록|계획등록/.test(sn) &&
    /계획\s*등록|계획등록/.test(bn) &&
    bn.length > sn.length
  ) {
    return true;
  }
  return false;
}

/**
 * app_mention / message 등 공통: Bolt event에서 사용자 의도 문자열 추출
 * @param {{ text?: string, blocks?: unknown[] }} event
 */
export function getInboundCommandText(event) {
  let raw = event?.text != null ? String(event.text) : '';
  const fromBlocks = flattenSlackBlocksToText(event?.blocks || []);
  // Slack 클라이언트가 본문을 blocks(rich_text)에만 넣고 text 를 비우는 경우 → planner 매칭 전부 실패
  if (!raw.trim() && fromBlocks) {
    raw = fromBlocks;
  }
  const stripped = stripSlackMarkupArtifacts(raw).trim();
  const blockStripped = stripSlackMarkupArtifacts(fromBlocks).trim();
  const sn = stripped ? normalizeSlackUserPayload(stripped) : '';
  const bn = blockStripped ? normalizeSlackUserPayload(blockStripped) : '';

  let picked = stripped;
  // 굵게/서식 입력 시 text 필드에는 <@봇> 만 있고 본문은 blocks(rich_text)에만 있는 경우가 많음
  if (!stripped && blockStripped) {
    picked = blockStripped;
  } else if (shouldPreferBlocksOverStripped(stripped, blockStripped)) {
    picked = blockStripped;
  } else if (
    stripped &&
    blockStripped &&
    sn.includes('계획등록') &&
    bn.includes('계획등록') &&
    bn.length > sn.length
  ) {
    picked = blockStripped;
  } else if (
    stripped &&
    blockStripped &&
    sn.includes('계획등록') &&
    bn.includes('계획등록') &&
    sn.length > bn.length
  ) {
    picked = stripped;
  }

  let legacyNorm = normalizeSlackUserPayload(picked);
  const plannerPreferred = pickStrongerPlannerCandidate(stripped, blockStripped);
  if (plannerPreferred) {
    const rAlt = plannerLockRank(
      analyzePlannerResponderLock(normalizePlannerInputForRoute(plannerPreferred))
    );
    const rLeg = plannerLockRank(
      analyzePlannerResponderLock(normalizePlannerInputForRoute(legacyNorm))
    );
    if (rAlt > rLeg) {
      legacyNorm = plannerPreferred;
    }
  }

  return legacyNorm;
}
