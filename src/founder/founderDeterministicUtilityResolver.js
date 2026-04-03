/**
 * vNext.11 — Founder zero-command surface: deterministic COS voice (no command syntax, no operator jargon).
 */

import { getBuildInfo } from '../runtime/buildInfo.js';
import {
  looksLikeRuntimeShaQuery,
  classifyFounderOperationalProbe,
  classifyFounderRoutingLock,
} from '../features/inboundFounderRoutingLock.js';
import {
  buildProviderTruthSnapshot,
  PROVIDER_STATUS_KO,
} from '../core/providerTruthSnapshot.js';
import { getExecutionRunById, getExecutionRunByThread } from '../features/executionRun.js';
import { formatReconciliationLinesForFounder } from '../orchestration/truthReconciliation.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { detectFounderLaunchIntent } from '../core/founderLaunchIntent.js';
import { evaluateExecutionRunCompletion } from '../features/executionDispatchLifecycle.js';
import { founderTruthClosureWording } from './founderTruthClosureWording.js';

/**
 * @param {string} t
 * @returns {boolean}
 */
function wantsRunProgress(t) {
  return /(어디까지|진행|시작됐|시작되|디스패치|실행\s*상태|런\s*상태|아티팩트|산출물|지금\s*단계)/i.test(t);
}

/**
 * @param {string} t
 */
function wantsHandoffExplanation(t) {
  return /(핸드오프|handoff|왜\s*아직|수동\s*브리지|브리지로)/i.test(t);
}

/**
 * @param {string} t
 */
function wantsAllProviders(t) {
  return (
    /(연결\s*상태|외부\s*툴|툴체인|깃허브|GitHub|레일웨이|버셀)/i.test(t)
    && /(전부|모두|한\s*번에|요약|정리)/i.test(t)
  );
}

/**
 * @param {string} t
 */
function wantsCompletionClosure(t) {
  return /끝났|완료됐|완료되었|다\s*됐|끝났나|완료됐나|완료\s*여부|끝났는지|다\s*끝난/i.test(t);
}

function formatRuntimeCosVoice() {
  const b = getBuildInfo();
  return [
    '*[G1 COS Runtime]*',
    '지금 이 프로세스에서 보이는 코드 스탬프는 이렇게 정리됩니다.',
    `- release_sha 전체값은 \`${b.release_sha}\`, 짧게는 \`${b.release_sha_short}\`입니다.`,
    `- 브랜치는 \`${b.branch}\`, 부팅 시각은 ${b.started_at}, 실행 모드는 \`${b.runtime_mode}\`입니다.`,
    '배포 플랫폼에 올라가 있으면 이미지에 박힌 SHA가 우선일 수 있습니다.',
  ].join('\n');
}

function formatProviderLine(p) {
  const ko = PROVIDER_STATUS_KO[p.status] || p.status;
  const note = p.note ? ` — ${p.note}` : '';
  return `- **${p.provider}**: ${ko} (\`${p.status}\`)${note}`;
}

function formatCursorCosVoice(snap) {
  const c = snap.providers.find((x) => x.provider === 'cursor_cloud');
  if (!c) return '지금은 Cursor 쪽 연결 정보를 스냅샷에서 찾지 못했습니다.';
  const ko = PROVIDER_STATUS_KO[c.status] || c.status;
  const lines = [
    '이 런타임 기준으로 Cursor Cloud 쪽은 이렇게 보입니다.',
    `- 상태: **${ko}** (\`${c.status}\`)`,
  ];
  if (c.note) lines.push(`- 이유·맥락: ${c.note}`);
  lines.push(
    '',
    '위는 시장 이야기가 아니라, launch URL·핸드오프 파일·실제 디스패치 기록을 합쳐 본 **연결 준비도**입니다.',
  );
  return lines.join('\n');
}

function formatSupabaseCosVoice(snap) {
  const s = snap.providers.find((x) => x.provider === 'supabase');
  if (!s) return 'Supabase 쪽 스냅샷을 아직 만들 수 없습니다.';
  const ko = PROVIDER_STATUS_KO[s.status] || s.status;
  const lines = [
    'Supabase는 프로젝트 연결·드래프트·스테이징 전달 경로를 기준으로 이렇게 보입니다.',
    `- 상태: **${ko}** (\`${s.status}\`)`,
  ];
  if (s.note) lines.push(`- 설명: ${s.note}`);
  lines.push('', '운영 DB에 직접 손대는지 여부는 별도 안전 정책으로 막아 두었습니다.');
  return lines.join('\n');
}

function formatAllProvidersCosVoice(snap) {
  const lines = [
    '연결된 외부 경로를 한 번에 정리하면 아래와 같습니다.',
    ...(snap.providers || []).map(formatProviderLine),
  ];
  return lines.join('\n');
}

function formatRunProgressCosVoice(run, snap) {
  if (!run?.run_id) {
    return '이 스레드에는 아직 실행 런이 붙어 있지 않습니다. 목표를 한 줄만 더 보내 주시면 다음 단계로 묶어 드리겠습니다.';
  }
  const fresh = getExecutionRunById(run.run_id) || run;
  const recon = formatReconciliationLinesForFounder(fresh);
  const lines = [
    `실행 런 \`${run.run_id}\` — 아래는 **truth_reconciliation + provider 스냅샷**만입니다.`,
    '',
    ...recon,
    '',
    '*Provider truth (요약)*',
    ...(snap.providers || []).map(formatProviderLine),
  ];
  return lines.join('\n');
}

function formatHandoffCosVoice(snap, run) {
  const c = snap.providers.find((x) => x.provider === 'cursor_cloud');
  const fresh = run?.run_id ? getExecutionRunById(run.run_id) : null;
  const recon = fresh ? formatReconciliationLinesForFounder(fresh) : [];
  const parts = [
    '**정본 기준 설명** (에이전트 서술이 아니라 reconciliation·provider truth)',
    '',
    ...recon,
    '',
    'Cursor provider 한 줄:',
  ];
  if (c?.status === 'manual_bridge') {
    parts.push(`- **수동 브리지**: ${c.note || 'launch/handoff ref를 스냅샷에서 확인하세요.'}`);
  } else if (c) {
    parts.push(`- 상태: \`${c.status}\`${c.note ? ` — ${c.note}` : ''}`);
  }
  if (run?.artifacts?.fullstack_swe?.cursor_handoff_path) {
    parts.push(`- 관측된 핸드오프 경로: \`${run.artifacts.fullstack_swe.cursor_handoff_path}\``);
  }
  parts.push('', '부족한 ref는 reconciliation 줄의 unsatisfied/draft_only를 기준으로 보시면 됩니다.');
  return parts.join('\n');
}

function formatShortHelpCosVoice() {
  return [
    '여기서는 특별한 명령어 형식 없이, 그냥 말씀하시면 됩니다.',
    '목표 한 줄·범위·우선순위만 주시면 COS가 스레드 맥락에 맞춰 이어 갑니다.',
    '실행을 밀어 올리려면 평소처럼 “진행하자” 류로 말씀해 주시면 됩니다.',
  ].join('\n');
}

/**
 * @param {{ normalized: string, threadKey: string, metadata?: object }} args
 * @returns {{ handled: false } | { handled: true, text: string, kind: string }}
 */
export function tryResolveFounderDeterministicUtility({ normalized, threadKey, metadata: _metadata = {} }) {
  const t = String(normalized || '').trim();
  if (!t) return { handled: false };

  try {
    if (detectFounderLaunchIntent(t, _metadata, threadKey).detected) {
      return { handled: false };
    }
  } catch {
    /* launch probe must never block utility path */
  }

  const run = getExecutionRunByThread(threadKey) || null;
  const space = getProjectSpaceByThread(threadKey) || null;
  const snap = buildProviderTruthSnapshot({ space, run });

  const routeLock = classifyFounderRoutingLock(t);
  if (routeLock?.kind === 'version') {
    return { handled: true, kind: 'runtime_stamp', text: formatRuntimeCosVoice() };
  }

  if (looksLikeRuntimeShaQuery(t)) {
    return { handled: true, kind: 'runtime_stamp', text: formatRuntimeCosVoice() };
  }

  const op = classifyFounderOperationalProbe(t);
  if (op?.kind === 'provider_cursor') {
    return { handled: true, kind: 'provider_cursor', text: formatCursorCosVoice(snap) };
  }
  if (op?.kind === 'provider_supabase') {
    return { handled: true, kind: 'provider_supabase', text: formatSupabaseCosVoice(snap) };
  }

  if (wantsAllProviders(t)) {
    return { handled: true, kind: 'providers_all', text: formatAllProvidersCosVoice(snap) };
  }

  if (wantsCompletionClosure(t)) {
    if (!run?.run_id) {
      return {
        handled: true,
        kind: 'completion_closure',
        text:
          '이 스레드에는 실행 런이 아직 없어 `truth_reconciliation` 정본으로 완료를 말할 수 없습니다. 목표 한 줄을 주시면 런·정본 축을 먼저 잡겠습니다.',
      };
    }
    const fresh = getExecutionRunById(run.run_id) || run;
    const eval_ = evaluateExecutionRunCompletion(run.run_id);
    const hasTruth = Boolean(fresh?.truth_reconciliation?.entries?.length);
    const wording = founderTruthClosureWording(eval_, { hasTruthEntries: hasTruth });
    const recon = formatReconciliationLinesForFounder(fresh);
    return {
      handled: true,
      kind: 'completion_closure',
      text: [
        `*완료 여부 (정본 기준)* — ${wording.founder_phrase}`,
        '',
        ...recon,
      ].join('\n'),
    };
  }

  if (wantsRunProgress(t)) {
    return { handled: true, kind: 'run_progress', text: formatRunProgressCosVoice(run, snap) };
  }

  if (wantsHandoffExplanation(t)) {
    return { handled: true, kind: 'handoff_explainer', text: formatHandoffCosVoice(snap, run) };
  }

  if (/^(도움말|help|뭐\s*할\s*수\s*있)/i.test(t) && t.length < 40) {
    return { handled: true, kind: 'short_help', text: formatShortHelpCosVoice() };
  }

  return { handled: false };
}
