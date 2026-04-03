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
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { detectFounderLaunchIntent } from '../core/founderLaunchIntent.js';

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
  const od = run.orchestration_plan;
  const cap = od?.capabilities;
  const lines = [
    `실행 런 \`${run.run_id}\` 기준으로 보면,`,
    `- 단계: ${run.current_stage || 'unknown'} · 상태: ${run.status || 'unknown'}`,
    `- 바깥으로 나간 작업 묶음: ${run.outbound_dispatch_state || 'not_started'}`,
  ];
  if (cap) {
    lines.push(
      `- 이번 런에서 켜 둔 역할: research=${cap.research} · 코드/저장소=${cap.fullstack_code} · DB스키마=${cap.db_schema} · UI=${cap.uiux_design} · QA=${cap.qa_validation}`,
    );
  }
  if (od?.route_decisions?.length) {
    lines.push(`- 경로 결정 ${od.route_decisions.length}건이 기록돼 있습니다(스냅샷 요약만 표시).`);
  }
  lines.push('', '더 자세한 줄 단위 로그가 필요하면 그 부분만 짚어 말씀해 주세요.');
  const gh = snap.providers.find((p) => p.provider === 'github');
  if (gh) lines.push(`- GitHub 쪽 한 줄: \`${gh.status}\``);
  return lines.join('\n');
}

function formatHandoffCosVoice(snap, run) {
  const c = snap.providers.find((x) => x.provider === 'cursor_cloud');
  const parts = [
    '핸드오프로 보이는 경우는 보통 아래 중 하나입니다.',
    '- 자동 실행 URL이 비어 있거나, 원격 호출이 실패했을 때',
    '- 아직 이 스레드에 live 디스패치 성공 기록이 없을 때',
  ];
  if (c?.status === 'manual_bridge') {
    parts.push(`- 지금 Cursor는 **수동 브리지**로 분류됩니다: ${c.note || '설정을 확인해 주세요.'}`);
  }
  if (run?.artifacts?.fullstack_swe?.cursor_handoff_path) {
    parts.push(`- 생성된 핸드오프 파일: \`${run.artifacts.fullstack_swe.cursor_handoff_path}\``);
  }
  parts.push('', '원하시면 launch URL을 채운 뒤 같은 런에서 다시 밀어 올릴 수 있습니다.');
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
