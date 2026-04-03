/**
 * Project space / env / bootstrap 힌트를 founder-facing provider truth로 정규화 (thin layer).
 * Cursor/Supabase는 live / live_ready / draft_only / manual_bridge / unavailable / not_configured 로 구분.
 */

import { diagnoseGithubConfig } from '../features/executionDispatchLifecycle.js';
import { diagnoseVercelReadiness } from '../adapters/vercelAdapter.js';
import { diagnoseRailwayReadiness } from '../adapters/railwayAdapter.js';
import { diagnoseCursorCloudLaunch } from '../adapters/cursorCloudAdapter.js';
import { diagnoseSupabaseExecutionContext } from '../adapters/supabaseExecutionAdapter.js';

/**
 * @typedef {'live'|'live_ready'|'manual_bridge'|'draft_only'|'unavailable'|'not_configured'} ProviderStatus
 */

/** Founder-facing 상태 해석 (Slack). */
export const PROVIDER_STATUS_KO = {
  live: '자동 시작됨',
  live_ready: '발사 준비됨',
  manual_bridge: '수동 브리지 필요',
  draft_only: '로컬 드래프트·스텁',
  unavailable: '미연결',
  not_configured: '미연결',
};

/**
 * @param {{ providers?: Array<{ provider: string, status: string, note: string | null }> }} snap
 * @returns {string[]}
 */
export function formatProviderTruthLines(snap) {
  return (snap.providers || []).map(
    (p) => `${p.provider}: ${p.status}${p.note ? ` — ${p.note}` : ''}`,
  );
}

/**
 * @param {{ providers?: Array<{ provider: string, status: string, note: string | null }> }} snap
 * @returns {string[]}
 */
export function formatProviderTruthFriendlyLines(snap) {
  return (snap.providers || []).map((p) => {
    const ko = PROVIDER_STATUS_KO[p.status] || p.status;
    return `${p.provider}: ${ko} (\`${p.status}\`)${p.note ? ` — ${p.note}` : ''}`;
  });
}

function cursorTruthFromRunAndEnv(run) {
  const traces = run?.cursor_trace || [];
  const liveHit = traces.some(
    (t) => t.dispatch_mode === 'live' && (t.status === 'dispatched' || t.cursor_execution_mode === 'live'),
  );
  if (liveHit) {
    const last = [...traces].reverse().find((t) => t.dispatch_mode === 'live');
    const ref = last?.cursor_run_ref || last?.result_link || '';
    return {
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['cloud_launch'],
      note: ref ? `run_ref/link: ${String(ref).slice(0, 120)}` : 'Cursor Cloud launch 디스패치 완료',
    };
  }

  const diag = diagnoseCursorCloudLaunch();
  if (diag.launchUrlConfigured) {
    const authNote = diag.authConfigured ? 'auth 구성됨' : 'auth 미구성(선택)';
    return {
      status: /** @type {ProviderStatus} */ ('live_ready'),
      actions: ['cloud_launch_on_dispatch'],
      note: `dispatch 시 Cursor launch POST 예정 — ${authNote} · 응답 권장 필드: ${diag.expectedResponseKeys.join(', ')}`,
    };
  }

  const handoffPath = run?.artifacts?.fullstack_swe?.cursor_handoff_path;
  const handoffInTrace = traces.some((t) => t.handoff_path);
  if (handoffPath || handoffInTrace) {
    return {
      status: /** @type {ProviderStatus} */ ('manual_bridge'),
      actions: ['handoff_doc'],
      note: 'COS_CURSOR_CLOUD_LAUNCH_URL 미구성 — `data/exec-handoffs/` 핸드오프',
    };
  }

  return {
    status: 'unavailable',
    actions: [],
    note: 'launch URL·핸드오프 경로 없음',
  };
}

function supabaseTruthFromRunAndSpace(space, run) {
  const traces = run?.supabase_trace || [];
  const liveHit = traces.some((t) => t.execution_tier === 'live' && t.status === 'dispatched');
  if (liveHit) {
    const last = [...traces].reverse().find((t) => t.execution_tier === 'live');
    const ref = last?.apply_ref || last?.migration_path || '';
    const target = last?.dispatch_target ? `target: ${last.dispatch_target}` : '';
    return {
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['staged_dispatch', 'migration'],
      note: [ref ? `apply ref: ${String(ref).slice(0, 100)}` : 'staged dispatch 완료', target].filter(Boolean).join(' · '),
    };
  }

  const ctx = diagnoseSupabaseExecutionContext(space, run);
  const hasDraftTrace = traces.some((t) => t.kind === 'schema_draft');
  const hasStubTrace = traces.some((t) => t.kind === 'migration_stub');
  const dispatchFailed = traces.some(
    (t) => t.kind === 'live_dispatch' && (t.status === 'failed_or_skipped' || t.status === 'failed'),
  );
  const linkedOrArtifacts = ctx.project_linked || hasDraftTrace || hasStubTrace || ctx.migration_stub_available;

  if (ctx.live_dispatch_configured && !dispatchFailed) {
    const parts = [
      `안전 타깃: ${ctx.safe_target}`,
      'production 직접 apply 기본 비활성',
    ];
    if (linkedOrArtifacts) {
      parts.push('연결/드래프트 있음 — dispatch 시 staged 전달');
    } else {
      parts.push('웹훅만 구성 — DB 작업 런에서 드래프트·스텁 생성 후 전달');
    }
    return {
      status: /** @type {ProviderStatus} */ ('live_ready'),
      actions: ['staged_dispatch_webhook'],
      note: parts.join(' · '),
    };
  }

  if (linkedOrArtifacts || dispatchFailed) {
    const parts = [
      ctx.project_linked ? 'Supabase 프로젝트/env 연결됨' : '로컬 드래프트·스텁·이력',
      '스키마 JSON + `supabase/migrations/` 스텁 경로',
    ];
    if (dispatchFailed) parts.push('live dispatch 실패/스킵 — 웹훅·네트워크 확인');
    if (!ctx.live_dispatch_configured) {
      parts.push('COS_SUPABASE_LIVE_DISPATCH_URL 미구성 — staged 자동 전달 없음');
    }
    return {
      status: /** @type {ProviderStatus} */ ('draft_only'),
      actions: ['schema_draft_json', 'migration_stub_repo'],
      note: parts.join(' · '),
    };
  }

  return {
    status: /** @type {ProviderStatus} */ ('not_configured'),
    actions: [],
    note: '프로젝트 ref/URL 미연결 — DB 키워드 시 로컬 드래프트만 생성',
  };
}

/**
 * @param {object|null} space
 * @param {object|null} run
 * @returns {{
 *   providers: Array<{ provider: string, status: ProviderStatus, actions: string[], note: string | null }>,
 *   summary: Record<string, number>,
 *   manual_bridge_actions: string[],
 * }}
 */
export function buildProviderTruthSnapshot({ space = null, run = null } = {}) {
  const ghDiag = diagnoseGithubConfig();
  const vercelDiag = diagnoseVercelReadiness();
  const railwayDiag = diagnoseRailwayReadiness();

  /** @type {Array<{ provider: string, status: ProviderStatus, actions: string[], note: string | null }>} */
  const providers = [];

  const manual_bridge_actions = [];

  // GitHub
  if (ghDiag.configured) {
    providers.push({
      provider: 'github',
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['issue_seed', 'branch', 'pr'],
      note: null,
    });
  } else if (ghDiag.missing?.length) {
    providers.push({
      provider: 'github',
      status: /** @type {ProviderStatus} */ ('draft_only'),
      actions: ['issue_draft'],
      note: `env: ${ghDiag.missing.slice(0, 3).join(', ')}`,
    });
    manual_bridge_actions.push(`GitHub: ${ghDiag.missing.join(', ')} 설정 후 live 이슈/PR`);
  } else {
    providers.push({
      provider: 'github',
      status: 'not_configured',
      actions: [],
      note: null,
    });
  }

  // Cursor
  const cursorT = cursorTruthFromRunAndEnv(run);
  providers.push({
    provider: 'cursor_cloud',
    status: cursorT.status,
    actions: cursorT.actions,
    note: cursorT.note,
  });
  if (cursorT.status === 'manual_bridge') {
    manual_bridge_actions.push('Cursor: `data/exec-handoffs/` 핸드오프 확인 후 에이전트 실행');
  }

  // Supabase
  const sbT = supabaseTruthFromRunAndSpace(space, run);
  providers.push({
    provider: 'supabase',
    status: sbT.status,
    actions: sbT.actions,
    note: sbT.note,
  });
  if (sbT.status === 'not_configured') {
    manual_bridge_actions.push('Supabase: 프로젝트 연결 또는 DB 작업 런으로 드래프트 생성');
  }

  // Railway
  if (railwayDiag.configured) {
    providers.push({
      provider: 'railway',
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['status_check', 'deploy_trigger'],
      note: null,
    });
  } else {
    providers.push({
      provider: 'railway',
      status: 'draft_only',
      actions: ['deploy_draft'],
      note: railwayDiag.missing?.length ? railwayDiag.missing.join(', ') : 'not linked',
    });
    manual_bridge_actions.push(`Railway: ${(railwayDiag.missing || ['token']).join(', ')} 설정`);
  }

  // Vercel
  if (vercelDiag.configured) {
    providers.push({
      provider: 'vercel',
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['preview_deploy'],
      note: null,
    });
  } else {
    providers.push({
      provider: 'vercel',
      status: 'not_configured',
      actions: [],
      note: vercelDiag.missing?.length ? vercelDiag.missing.join(', ') : 'optional',
    });
  }

  // Run-time hints from existing run (if any)
  if (run?.git_trace?.repo) {
    const g = providers.find((p) => p.provider === 'github');
    if (g && g.status === 'draft_only') {
      g.status = 'manual_bridge';
      g.note = 'run에 repo 흔적 있음 — 브리지 가능';
    }
  }

  const summary = {
    live_count: providers.filter((p) => p.status === 'live').length,
    live_ready_count: providers.filter((p) => p.status === 'live_ready').length,
    manual_bridge_count: providers.filter((p) => p.status === 'manual_bridge').length,
    draft_only_count: providers.filter((p) => p.status === 'draft_only').length,
    unavailable_count: providers.filter((p) => p.status === 'unavailable').length,
    not_configured_count: providers.filter((p) => p.status === 'not_configured').length,
  };

  return { providers, summary, manual_bridge_actions };
}
