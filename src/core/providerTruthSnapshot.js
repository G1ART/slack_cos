/**
 * Project space / env / bootstrap 힌트를 founder-facing provider truth로 정규화 (thin layer).
 * 실행 경로가 없으면 live로 표기하지 않음 (Cursor/Supabase 정렬).
 */

import { diagnoseGithubConfig } from '../features/executionDispatchLifecycle.js';
import { diagnoseVercelReadiness } from '../adapters/vercelAdapter.js';
import { diagnoseRailwayReadiness } from '../adapters/railwayAdapter.js';
import { diagnoseCursorCloudLaunch } from '../adapters/cursorCloudAdapter.js';
import { diagnoseSupabaseLiveExecution } from '../adapters/supabaseExecutionAdapter.js';

/** @typedef {'live'|'manual_bridge'|'draft_only'|'unavailable'|'not_configured'} ProviderStatus */

/**
 * @param {{ providers?: Array<{ provider: string, status: string, note: string | null }> }} snap
 * @returns {string[]}
 */
export function formatProviderTruthLines(snap) {
  return (snap.providers || []).map(
    (p) => `${p.provider}: ${p.status}${p.note ? ` — ${p.note}` : ''}`,
  );
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
  if (diag.liveRouteConfigured) {
    return {
      status: /** @type {ProviderStatus} */ ('draft_only'),
      actions: ['cloud_launch_on_dispatch'],
      note: 'COS_CURSOR_CLOUD_LAUNCH_URL 구성됨 — outbound dispatch 시 자동 POST',
    };
  }

  const handoff = run?.artifacts?.fullstack_swe?.cursor_handoff_path
    || traces.some((t) => t.handoff_path);
  if (handoff || process.cwd()) {
    return {
      status: /** @type {ProviderStatus} */ ('manual_bridge'),
      actions: ['handoff_doc'],
      note: 'Cursor Cloud 자동 실행 경로 미구성 — `data/exec-handoffs/` 핸드오프',
    };
  }

  return {
    status: 'unavailable',
    actions: [],
    note: 'workspace 경로 없음',
  };
}

function supabaseTruthFromRunAndSpace(space, run) {
  const traces = run?.supabase_trace || [];
  const liveHit = traces.some((t) => t.execution_tier === 'live' && t.status === 'dispatched');
  if (liveHit) {
    const last = [...traces].reverse().find((t) => t.execution_tier === 'live');
    const ref = last?.apply_ref || last?.migration_path || '';
    return {
      status: /** @type {ProviderStatus} */ ('live'),
      actions: ['live_dispatch', 'migration'],
      note: ref ? `apply/dispatch ref: ${String(ref).slice(0, 120)}` : 'live dispatch 확인됨',
    };
  }

  const spaceLinked =
    space?.supabase_ready_status === 'configured'
    || Boolean(space?.supabase_project_ref)
    || Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  const hasDraftTrace = traces.some((t) => t.kind === 'schema_draft' || t.kind === 'migration_stub');

  if (spaceLinked || hasDraftTrace) {
    const liveDiag = diagnoseSupabaseLiveExecution();
    const noteParts = [
      '스키마 JSON 드래프트 + `supabase/migrations/` 스텁 — 원격 적용은 COS에서 기본 수행 안 함',
    ];
    if (liveDiag.liveDispatchConfigured) {
      noteParts.push('COS_SUPABASE_LIVE_DISPATCH_URL 구성됨 — dispatch 시 웹훅 전달 시도');
    }
    return {
      status: /** @type {ProviderStatus} */ ('draft_only'),
      actions: ['schema_draft_json', 'migration_stub_repo'],
      note: noteParts.join(' · '),
    };
  }

  return {
    status: /** @type {ProviderStatus} */ ('not_configured'),
    actions: [],
    note: 'Supabase project/url 미연결 — 스키마 드래프트는 DB 작업 키워드 시 로컬 생성',
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
    manual_bridge_actions.push('Supabase: 프로젝트 ref/URL 연결 후 스테이징에서 마이그레이션 적용');
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
    manual_bridge_count: providers.filter((p) => p.status === 'manual_bridge').length,
    draft_only_count: providers.filter((p) => p.status === 'draft_only').length,
    unavailable_count: providers.filter((p) => p.status === 'unavailable').length,
    not_configured_count: providers.filter((p) => p.status === 'not_configured').length,
  };

  return { providers, summary, manual_bridge_actions };
}
