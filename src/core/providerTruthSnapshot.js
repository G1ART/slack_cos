/**
 * Project space / env / bootstrap 힌트를 founder-facing provider truth로 정규화 (thin layer).
 */

import { diagnoseGithubConfig } from '../features/executionDispatchLifecycle.js';
import { diagnoseVercelReadiness } from '../adapters/vercelAdapter.js';
import { diagnoseRailwayReadiness } from '../adapters/railwayAdapter.js';

/** @typedef {'live'|'manual_bridge'|'draft_only'|'unavailable'|'not_configured'} ProviderStatus */

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
    manual_bridge_actions.push(`GitHub: ${ghDiag.missing.join(', ')} 설정 후 연동`);
  } else {
    providers.push({
      provider: 'github',
      status: 'not_configured',
      actions: [],
      note: null,
    });
  }

  // Cursor Cloud / handoff path
  const hasHandoffRoot = Boolean(space?.cursor_handoff_root || process.cwd());
  providers.push({
    provider: 'cursor_cloud',
    status: hasHandoffRoot ? 'manual_bridge' : 'unavailable',
    actions: hasHandoffRoot ? ['handoff_doc'] : [],
    note: hasHandoffRoot ? 'Cursor Cloud 자동 실행 없음 — handoff 문서 경로 사용' : 'workspace 경로 없음',
  });
  if (hasHandoffRoot) {
    manual_bridge_actions.push('Cursor: `data/exec-handoffs/` 핸드오프 확인 및 에이전트 실행');
  }

  // Supabase
  const sbReady = space?.supabase_ready_status === 'configured' || Boolean(space?.supabase_project_ref);
  if (sbReady) {
    providers.push({
      provider: 'supabase',
      status: 'live',
      actions: ['schema_link', 'migration'],
      note: null,
    });
  } else {
    providers.push({
      provider: 'supabase',
      status: 'manual_bridge',
      actions: ['schema_draft'],
      note: 'project ref 미연결 — 스키마 드래프트·수동 적용',
    });
    manual_bridge_actions.push('Supabase: 프로젝트 ref/url 연결 후 마이그레이션 적용');
  }

  // Railway
  if (railwayDiag.configured) {
    providers.push({
      provider: 'railway',
      status: 'live',
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
      status: 'live',
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
