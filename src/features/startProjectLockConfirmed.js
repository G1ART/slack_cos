/**
 * 킥오프 정렬(COS 1턴) 직후, 대표가 답변 + 확정(진행해줘 등)을 보낸 2턴 전용 표면.
 * Council·APR·업무등록 유도 없이 scope lock → 내부 실행 전환만 노출.
 */

import { buildSlackThreadKey, getConversationTranscript } from './slackConversationBuffer.js';
import { isCouncilCommand } from '../slack/councilCommandPrefixes.js';
import { extractLatestStartProjectUserLineFromTranscript } from './startProjectKickoffDoor.js';
import { appendWorkspaceQueueItem } from './cosWorkspaceQueue.js';

/**
 * @param {string} transcript
 * @returns {string[]}
 */
function parseTranscriptCosChunks(transcript) {
  const t = String(transcript || '').trim();
  if (!t) return [];
  const chunks = t.split(/\n\n(?=\[)/u);
  const pref = '[COS]\n';
  /** @type {string[]} */
  const out = [];
  for (const c of chunks) {
    if (c.startsWith(pref)) out.push(c.slice(pref.length).trim());
  }
  return out;
}

function parseTranscriptUserChunks(transcript) {
  const t = String(transcript || '').trim();
  if (!t) return [];
  const chunks = t.split(/\n\n(?=\[)/u);
  const pref = '[사용자]\n';
  /** @type {string[]} */
  const out = [];
  for (const c of chunks) {
    if (c.startsWith(pref)) out.push(c.slice(pref.length).trim());
  }
  return out;
}

/**
 * 버퍼 transcript 상 마지막 COS 턴이 킥오프 정렬 요약인지 (현재 user 턴은 아직 버퍼에 없음).
 * @param {string} transcript
 */
export function lastAssistantTurnWasStartProjectKickoff(transcript) {
  const cos = parseTranscriptCosChunks(transcript);
  if (!cos.length) return false;
  const last = cos[cos.length - 1];
  return (
    /정렬\s*·\s*툴\/프로젝트\s*킥오프/u.test(last) &&
    /내가\s*이해한\s*요청/u.test(last) &&
    /다음\s*산출물/u.test(last)
  );
}

/** @param {string} t */
export function hasProjectLockProceedSignal(t) {
  const s = String(t || '').trim();
  if (s.length < 3) return false;
  return (
    /진행\s*해\s*줘|진행해줘|그렇게\s*가\s*자|오케이|확정|잠그|이대\s*로|이\s*대로/u.test(s) ||
    /\bOK\b/i.test(s) ||
    /(?:^|[\s,.!\n])좋아(?:[\s,.!\n]|$)/u.test(s) ||
    /가\s*자\b/u.test(s)
  );
}

/**
 * 답변 본문이 충분히 있거나, 짧은 확정 한 줄만 있는 경우(무응답 기본값 전부 수락).
 * @param {string} t
 */
function hasAcceptableLockReplyBody(t) {
  const s = String(t || '').trim();
  if (s.length >= 36) return true;
  const lines = s.split(/\r?\n/).filter((x) => x.trim()).length;
  if (lines >= 2) return true;
  if (/[.:：]/.test(s) && s.length >= 24) return true;
  const compact = s.replace(/[\s\n\r.,!~]+/g, ' ').trim();
  if (
    compact.length <= 32 &&
    /^(?:네|예|응|좋아|OK|오케이|그래|확정|알겠|그렇게)*\s*(?:진행\s*해\s*줘|진행해줘|가\s*자)\s*$/iu.test(
      compact,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * sync — Council APR 억제·푸터 가드 등에서 사용
 * @param {string} trimmed
 * @param {Record<string, unknown>} [metadata]
 */
export function isStartProjectLockConfirmedContext(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return false;
  if (isCouncilCommand(trimmed)) return false;
  const key = buildSlackThreadKey(metadata);
  const prior = getConversationTranscript(key);
  if (!lastAssistantTurnWasStartProjectKickoff(prior)) return false;
  if (!hasProjectLockProceedSignal(trimmed)) return false;
  if (!hasAcceptableLockReplyBody(trimmed)) return false;
  return true;
}

/**
 * @param {string} goalLine
 * @param {string} userFollowUp 원본 user 메시지(답변 + 확정)
 */
export function buildProjectLockConfirmedSurface(goalLine, userFollowUp) {
  const g = String(goalLine || '').trim() || '프로젝트';
  const u = String(userFollowUp || '').trim();
  const uClip = u.length > 900 ? `${u.slice(0, 900)}…` : u;

  return [
    '*[범위 잠금 · 실행 전환]*',
    '',
    '좋습니다. 말씀해 주신 기준으로 **MVP 범위를 잠그겠습니다.**',
    '',
    '*1. 잠긴 MVP 요약*',
    `_초기 목표:_ ${g.slice(0, 400)}${g.length > 400 ? '…' : ''}`,
    uClip ? `_대표 확인·보정(원문):_ ${uClip}` : '',
    '',
    '*2. 이번 단계 포함 범위*',
    '- 월/주 중심 캘린더 뷰, 일정 CRUD, 멤버·역할, 승인·반복 등 **방금 합의한 요소**를 기준으로 합니다.',
    '- 저장·동기화는 **Supabase** 를 전제로 한 설계 초안을 내부에서 잡습니다.',
    '',
    '*3. 이번 단계 제외 · 후속 확장*',
    '- 대표님이 **후속**(예: 공개 블랙아웃 링크, 결제·요금 트리거, 모바일 네이티브 전용)으로 두신 항목은 **이번 릴리스 밖**에 둡니다.',
    '- 제외 목록은 필요 시 PLN 본문에 명시해 두겠습니다.',
    '',
    '*4. 내부 실행 역할(한 줄)*',
    'COS가 **계획·작업 시드·스키마 초안·Cursor용 실행 지시**를 한 덩어리로 묶어 내부 멀티 에이전트에 넘깁니다. 대표 표면에는 페르소나별 장문을 붙이지 않습니다.',
    '',
    '*5. 지금부터 만드는 산출물*',
    '- **실행 계획(PLN) 초안**',
    '- **작업 시드(WRK)** (캘린더 코어·승인·반복·충돌 등)',
    '- **Supabase 테이블·정책 초안**',
    '- **실행/핸드오프 패킷** (Cursor·Evidence 루프용)',
    '',
    '_이 턴에는 **승인 대기열(APR)을 만들지 않습니다.** 대표님이 “진행”까지만 해 주시면, COS가 위 산출물을 내부적으로 생성·정렬합니다._',
    '_내부 운영 명령어를 외우실 필요 없습니다._',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {string} trimmed
 * @param {Record<string, unknown>} [metadata]
 * @returns {Promise<{ text: string, packet_id: null, response_type: 'start_project_confirmed' } | null>}
 */
export async function tryStartProjectLockConfirmedResponse(trimmed, metadata) {
  if (!isStartProjectLockConfirmedContext(trimmed, metadata)) return null;

  const key = buildSlackThreadKey(metadata);
  const prior = getConversationTranscript(key);
  const users = parseTranscriptUserChunks(prior);
  const goalLine =
    extractLatestStartProjectUserLineFromTranscript(prior) || (users.length ? users[users.length - 1] : '') || '';

  const surface = buildProjectLockConfirmedSurface(goalLine, trimmed);
  /** @type {string[]} */
  const extra = [];
  if (metadata && typeof metadata === 'object') {
    try {
      const body = `[project_lock_confirmed]\n초기목표: ${String(goalLine).slice(0, 2000)}\n\n대표 확인:\n${trimmed.slice(0, 6000)}`;
      await appendWorkspaceQueueItem({
        kind: 'spec_intake',
        body,
        metadata,
        channelContext: null,
      });
      extra.push(
        '',
        '_잠긴 범위와 확인 내용은 **실행 정렬 큐**에도 남겼습니다. 내부적으로 PLN·WRK 시드·스키마 초안을 이어서 만들겠습니다._',
      );
    } catch {
      extra.push('', '_실행 정렬 큐 기록에 실패했습니다. 동일 스레드에서 한 번 더 보내 주시면 재시도됩니다._');
    }
  }

  return {
    text: [surface, ...extra].join('\n'),
    packet_id: null,
    response_type: 'start_project_confirmed',
  };
}
