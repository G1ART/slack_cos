/**
 * 툴/프로젝트 킥오프 이후: **턴 수가 아닌 충분성**으로만 실행 승인(잠금) 패킷.
 * 미충족 시 정제(refine) 표면만 — Council·APR·업무등록 유도 없음.
 */

import { buildSlackThreadKey, getConversationTranscript } from './slackConversationBuffer.js';
import { isCouncilCommand } from '../slack/councilCommandPrefixes.js';
import { isStartProjectKickoffInput } from './surfaceIntentClassifier.js';
import { extractLatestStartProjectUserLineFromTranscript } from './startProjectKickoffDoor.js';
import { appendWorkspaceQueueItem } from './cosWorkspaceQueue.js';
import { assessScopeSufficiency } from './scopeSufficiency.js';
import {
  isActiveProjectIntake,
  isPreLockIntake,
  hasOpenExecutionOwnership,
  touchProjectIntakeSession,
  transitionProjectIntakeStage,
  getProjectIntakeSession,
} from './projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun } from './executionRun.js';
import { dispatchOutboundActionsForRun } from './executionOutboundOrchestrator.js';

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

export function lastAssistantTurnWasStartProjectRefine(transcript) {
  const cos = parseTranscriptCosChunks(transcript);
  if (!cos.length) return false;
  const last = cos[cos.length - 1];
  return /스코프\s*정제\s*·\s*툴\/프로젝트/u.test(last);
}

function lastAssistantTurnWasKickoffOrRefine(transcript) {
  return lastAssistantTurnWasStartProjectKickoff(transcript) || lastAssistantTurnWasStartProjectRefine(transcript);
}

function extractGoalLineFromPrior(prior) {
  const users = parseTranscriptUserChunks(prior);
  return (
    extractLatestStartProjectUserLineFromTranscript(prior) || (users.length ? users[users.length - 1] : '') || ''
  );
}

/** 전사가 비어도 인테이크 세션의 goalLine으로 복구 */
export function resolveStartProjectGoalLine(prior, metadata) {
  const fromTx = String(extractGoalLineFromPrior(prior) || '').trim();
  if (fromTx) return fromTx;
  const sess = getProjectIntakeSession(metadata);
  const g = sess?.goalLine && String(sess.goalLine).trim();
  return g || '';
}

function inStartProjectIntakeContinuation(prior, metadata) {
  return lastAssistantTurnWasKickoffOrRefine(prior) || isPreLockIntake(metadata);
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
 * 실행 승인 패킷(잠금) — 충분성 + 진행 시그널 있을 때만
 */
export function isStartProjectLockConfirmedContext(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return false;
  if (isCouncilCommand(trimmed)) return false;
  const prior = getConversationTranscript(buildSlackThreadKey(metadata));
  if (!inStartProjectIntakeContinuation(prior, metadata)) return false;
  if (!hasProjectLockProceedSignal(trimmed)) return false;
  if (!hasAcceptableLockReplyBody(trimmed)) return false;
  const goalLine = resolveStartProjectGoalLine(prior, metadata);
  return assessScopeSufficiency(prior, trimmed, goalLine, {
    quarantineFuturePhaseIdeas: true,
    relaxBenchmarkForStickyIntake: isPreLockIntake(metadata),
  }).sufficient;
}

/**
 * 정제 루프 APR 억제 — 킥오프/정제 COS 직후 대표턴
 */
export function isStartProjectRefineFlowContext(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return false;
  if (isCouncilCommand(trimmed)) return false;
  if (isStartProjectKickoffInput(trimmed)) return false;
  if (hasOpenExecutionOwnership(metadata)) return false;
  const prior = getConversationTranscript(buildSlackThreadKey(metadata));
  if (!inStartProjectIntakeContinuation(prior, metadata)) return false;
  if (isStartProjectLockConfirmedContext(trimmed, metadata)) return false;
  return true;
}

export function buildProjectLockConfirmedSurface(goalLine, userFollowUp) {
  const g = String(goalLine || '').trim() || '프로젝트';
  const u = String(userFollowUp || '').trim();
  const uClip = u.length > 900 ? `${u.slice(0, 900)}…` : u;

  return [
    '*[실행 승인 요청 · 범위 잠금]*',
    '',
    '판단하기에 **MVP 정의와 리스크가 실행 단계로 넘길 만큼 충분합니다.** (턴 수가 아니라, 말씀·합의의 밀도 기준입니다.)',
    '',
    '*1. 잠긴 MVP 요약*',
    `_초기 목표:_ ${g.slice(0, 400)}${g.length > 400 ? '…' : ''}`,
    uClip ? `_대표 확인·보정(원문):_ ${uClip}` : '',
    '',
    '*2. 이번 단계 포함*',
    '- 논의에서 합의된 기능·규칙(뷰, 일정, 승인, 반복, 권한 등)을 PLN·WRK에 옮깁니다.',
    '- 저장·동기화는 **Supabase** 설계 초안과 맞춥니다.',
    '',
    '*3. 제외 · 후속*',
    '- 후속(공개 링크, 결제, 네이티브 전용 최적화 등)은 **명시적으로 밖**에 둡니다.',
    '',
    '*4. 왜 지금 실행해도 되는지*',
    '- 문제 정의·사용자·MVP 경계·주요 리스크가 말로 고정되었고, 남은 불확실성은 기본값·반복 가능한 범위로 처리 가능합니다.',
    '',
    '*5. 내부 실행(한 줄)*',
    'COS가 계획·작업 시드·스키마 초안·Cursor 핸드오프를 한 덩어리로 묶습니다. 페르소나 장문은 대표 표면에 쓰지 않습니다.',
    '',
    '*6. 바로 만들 산출물*',
    '- PLN 초안 · WRK 시드 · Supabase 초안 · 실행 패킷',
    '',
    '승인해 주시면 **내부 오케스트레이션**으로 넘어가고, 대표 표면은 결과·에스컬레이션 위주로 유지하겠습니다.',
    '',
    '_이 턴에 **APR을 자동 만들지는 않습니다** — 원하시면 별도 승인 게이트 정책을 맞춥니다._',
    '_내부 운영 명령을 외우실 필요 없습니다._',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {string} goalLine
 * @param {string} userMsg
 * @param {{ sufficient: boolean, gaps: string[] }} suff
 */
export function buildStartProjectRefineSurface(goalLine, userMsg, suff) {
  const g = String(goalLine || '').trim() || '프로젝트';
  const u = String(userMsg || '').trim();
  const uClip = u.length > 700 ? `${u.slice(0, 700)}…` : u;
  const proceed = hasProjectLockProceedSignal(u);

  /** @type {string[]} */
  const lines = [
    '*[스코프 정제 · 툴/프로젝트]*',
    '',
    '_역할: 성공 확률을 높이기 위한 **PM/Chief Engineer** — 맹목적 동의가 아니라, 범위·리스크를 짚는 쪽에 섭니다._',
    '',
    uClip ? `*이번에 반영한 말씀:* _${uClip}_` : '',
    '',
    '*현재까지 이해한 목표(한 줄)*',
    `_${g.slice(0, 420)}${g.length > 420 ? '…' : ''}_`,
    '',
  ];

  if (proceed && !suff.sufficient) {
    lines.push(
      '*실행 전환 전 — 아직 부족한 부분*',
      '“진행” 의사는 이해했습니다. 다만 **책임 있게 코드로 넘기려면** 아래가 더 필요합니다.',
      ...suff.gaps.map((x) => `- ${x}`),
      '',
    );
  }

  lines.push(
    '*가벼운 시장·벤치마크 (참고)*',
    '- 팀/멤버 캘린더·대관 예약은 **Google Calendar / 팀 단위 툴 / 단순 시설 예약** 등과 UX 기대가 갈립니다. 이번 MVP가 어디에 가깝게 붙을지 합의하면 설계가 빨라집니다.',
    '',
    '*반대 가능성 (한 줄)*',
    '- 한 번에 웹+모바일 풀편집·외부 공개·결제까지 넣으면 검증이 느려질 수 있어, **이번에 검증할 한 가지**를 같이 고정하면 좋겠습니다.',
    '',
    '*다음으로 가장 정보 가치가 큰 것*',
    suff.gaps.length
      ? `1. ${suff.gaps[0]}`
      : '1. 이번 MVP가 “팀 일정+승인”과 “공간 대관” 중 **어느 축을 검증의 중심**으로 둘지',
    suff.gaps.length > 1 ? `2. ${suff.gaps[1]}` : '2. 첫 성공: **사용자가 “됐다”고 느끼는 행동 한 가지**',
    suff.gaps.length > 2 ? `3. ${suff.gaps[2]}` : '3. **후순위**로 확실히 미룰 것 한 가지',
    '',
    '_질문 폭탄이 아니라, 한 턴에 꼭 고정할 최소만 묻습니다. “이정도면 충분하지 않나?”라고 역으로 말씀해 주셔도 됩니다._',
    '_이 턴 **APR 없음** — 승인 큐는 범위가 잠긴 뒤에만 둡니다._',
  );

  return lines.filter(Boolean).join('\n');
}

/**
 * @returns {Promise<{ text: string, packet_id: string, run_id: string, response_type: 'start_project_confirmed' } | null>}
 */
export async function tryStartProjectLockConfirmedResponse(trimmed, metadata) {
  if (!isStartProjectLockConfirmedContext(trimmed, metadata)) return null;

  const prior = getConversationTranscript(buildSlackThreadKey(metadata));
  const goalLine = resolveStartProjectGoalLine(prior, metadata);
  const threadKey = buildSlackThreadKey(metadata);
  const sess = getProjectIntakeSession(metadata);

  const packet = createExecutionPacket({
    thread_key: threadKey,
    goal_line: goalLine,
    locked_scope_summary: goalLine,
    includes: sess?.spec?.includes || [],
    excludes: sess?.spec?.excludes || [],
    deferred_items: sess?.spec?.future_phase_backlog || [],
    approval_rules: sess?.spec?.approval_rules || [],
    session_id: sess?.spec?.session_id || '',
    requested_by: String(metadata?.user || ''),
  });

  const run = createExecutionRun({ packet, metadata });

  // Auto-dispatch outbound (fire-and-forget; errors handled per-lane)
  dispatchOutboundActionsForRun(run, metadata).catch((err) => {
    console.warn('[startProjectLockConfirmed] auto-dispatch error:', err?.message || err);
  });

  transitionProjectIntakeStage(metadata, 'execution_running', {
    packet_id: packet.packet_id,
    run_id: run.run_id,
  });

  const surface = buildProjectLockConfirmedSurface(goalLine, trimmed);
  /** @type {string[]} */
  const extra = [];
  if (metadata && typeof metadata === 'object') {
    try {
      const body = `[execution_approval_packet]\npacket_id: ${packet.packet_id}\nrun_id: ${run.run_id}\n초기목표: ${String(goalLine).slice(0, 2000)}\n\n대표 확인:\n${trimmed.slice(0, 6000)}`;
      await appendWorkspaceQueueItem({
        kind: 'spec_intake',
        body,
        metadata,
        channelContext: null,
      });
      extra.push(
        '',
        `_실행 패킷 \`${packet.packet_id}\` · 실행 \`${run.run_id}\` 생성. 내부 오케스트레이션 개시._`,
      );
    } catch {
      extra.push('', '_실행 정렬 큐 기록에 실패했습니다. 동일 스레드에서 한 번 더 보내 주시면 재시도됩니다._');
    }
  }

  return {
    text: [surface, ...extra].join('\n'),
    packet_id: packet.packet_id,
    run_id: run.run_id,
    response_type: 'start_project_confirmed',
  };
}

/**
 * @returns {Promise<{ text: string, packet_id: null, response_type: 'start_project_refine' } | null>}
 */
export async function tryStartProjectRefineResponse(trimmed, metadata) {
  if (!isStartProjectRefineFlowContext(trimmed, metadata)) return null;

  const prior = getConversationTranscript(buildSlackThreadKey(metadata));
  const goalLine = resolveStartProjectGoalLine(prior, metadata);
  const suff = assessScopeSufficiency(prior, trimmed, goalLine, {
    quarantineFuturePhaseIdeas: true,
    relaxBenchmarkForStickyIntake: isPreLockIntake(metadata),
  });

  const text = buildStartProjectRefineSurface(goalLine, trimmed, suff);
  return {
    text,
    packet_id: null,
    response_type: 'start_project_refine',
  };
}

/**
 * 활성 인테이크 세션이 있을 때만: 잠금 → 정제 → (최후) 정제 표면 고정.
 * Council·dialog 대표 표면 새는 것을 막는다.
 * @returns {Promise<{ text: string, packet_id: null, response_type: string } | null>}
 */
export async function tryProjectIntakeExecutiveContinue(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return null;
  if (isCouncilCommand(trimmed)) return null;
  if (!isPreLockIntake(metadata)) return null;
  touchProjectIntakeSession(metadata);

  const lock = await tryStartProjectLockConfirmedResponse(trimmed, metadata);
  if (lock != null) return lock;

  const refine = await tryStartProjectRefineResponse(trimmed, metadata);
  if (refine != null) return refine;

  return tryProjectIntakeForcedRefineSurface(trimmed, metadata);
}

/**
 * 잠금·정제를 바깥에서 이미 시도한 뒤에도 응답이 없을 때(세션만 살아 있는 경우) 정제 표면 강제.
 * @returns {Promise<{ text: string, packet_id: null, response_type: 'start_project_refine' } | null>}
 */
export async function tryProjectIntakeForcedRefineSurface(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return null;
  if (isCouncilCommand(trimmed)) return null;
  if (!isPreLockIntake(metadata)) return null;
  touchProjectIntakeSession(metadata);
  const prior = getConversationTranscript(buildSlackThreadKey(metadata));
  const goalLine = resolveStartProjectGoalLine(prior, metadata);
  const suff = assessScopeSufficiency(prior, trimmed, goalLine, {
    quarantineFuturePhaseIdeas: true,
    relaxBenchmarkForStickyIntake: isPreLockIntake(metadata),
  });
  const text = buildStartProjectRefineSurface(goalLine, trimmed, suff);
  return {
    text,
    packet_id: null,
    response_type: 'start_project_refine',
  };
}
