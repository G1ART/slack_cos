/**
 * Project Space Bootstrap — 새 프로젝트 요청 시 bootstrap plan 생성 + draft-first adapters 연결.
 */

import {
  createProjectSpace,
  linkThreadToProjectSpace,
  updateProjectSpace,
} from './projectSpaceRegistry.js';
import { diagnoseGithubConfig } from './executionDispatchLifecycle.js';
import { diagnoseVercelReadiness, buildVercelBootstrapDraft } from '../adapters/vercelAdapter.js';
import { diagnoseRailwayReadiness, buildRailwayBootstrapDraft } from '../adapters/railwayAdapter.js';

function logBootstrap(event, fields = {}) {
  try {
    console.info(JSON.stringify({ stage: event, ts: new Date().toISOString(), ...fields }));
  } catch { /* */ }
}

/**
 * Build a bootstrap plan for a new project space.
 * @param {{ label: string, aliases?: string[], threadKey?: string, repoOwner?: string, repoName?: string, metadata?: object }} opts
 */
export function bootstrapProjectSpace(opts = {}) {
  const ghDiag = diagnoseGithubConfig();
  const vercelDiag = diagnoseVercelReadiness();
  const railwayDiag = diagnoseRailwayReadiness();

  const space = createProjectSpace({
    human_label: opts.label || 'New Project',
    aliases: opts.aliases || [],
    canonical_summary: opts.summary || '',
    repo_owner: opts.repoOwner || process.env.GITHUB_DEFAULT_OWNER || null,
    repo_name: opts.repoName || null,
    github_ready_status: ghDiag.configured ? 'ready' : 'not_configured',
    cursor_workspace_root: opts.cursorRoot || process.cwd(),
    cursor_handoff_root: opts.cursorHandoffRoot || 'docs/cursor-handoffs',
    supabase_project_ref: opts.supabaseRef || null,
    supabase_url: opts.supabaseUrl || null,
    supabase_ready_status: opts.supabaseRef ? 'configured' : 'not_configured',
    vercel_project_id: opts.vercelProjectId || null,
    vercel_ready_status: vercelDiag.configured ? 'ready' : 'not_configured',
    railway_project_id: opts.railwayProjectId || null,
    railway_ready_status: railwayDiag.configured ? 'ready' : 'not_configured',
  });

  if (opts.threadKey) {
    linkThreadToProjectSpace(space.project_id, opts.threadKey);
  }

  const plan = buildBootstrapPlan(space, { ghDiag, vercelDiag, railwayDiag });

  logBootstrap('project_space_bootstrapped', { project_id: space.project_id, label: space.human_label });

  return { space, plan };
}

function buildBootstrapPlan(space, diags) {
  const steps = [];
  const manualActions = [];

  if (diags.ghDiag.configured) {
    if (space.repo_name) {
      steps.push({ provider: 'github', action: 'link_existing_repo', status: 'ready', target: `${space.repo_owner}/${space.repo_name}` });
    } else {
      steps.push({ provider: 'github', action: 'repo_bootstrap', status: 'manual_required', note: 'repo_name 미지정 — 수동 생성 또는 이름 지정 필요' });
      manualActions.push('GitHub: 레포 이름 지정 후 `gh repo create` 또는 웹에서 생성');
    }
  } else {
    steps.push({ provider: 'github', action: 'configure', status: 'draft_only', note: `미설정: ${diags.ghDiag.missing.join(', ')}` });
    manualActions.push(`GitHub: ${diags.ghDiag.missing.join(', ')} 환경변수 설정`);
  }

  steps.push({ provider: 'cursor', action: 'workspace_ready', status: space.cursor_workspace_root ? 'ready' : 'manual_required' });

  if (space.supabase_ready_status === 'configured') {
    steps.push({ provider: 'supabase', action: 'link_project', status: 'ready', target: space.supabase_project_ref });
  } else {
    steps.push({ provider: 'supabase', action: 'create_project', status: 'manual_required', note: 'supabase_project_ref 미설정' });
    manualActions.push('Supabase: 프로젝트 생성 후 ref/url 연결');
  }

  if (diags.vercelDiag.configured) {
    steps.push({ provider: 'vercel', action: 'link_project', status: 'ready' });
  } else {
    const draft = buildVercelBootstrapDraft(space);
    steps.push({ provider: 'vercel', action: 'bootstrap_draft', status: 'draft_only', draft });
    manualActions.push(`Vercel: ${diags.vercelDiag.missing?.join(', ') || 'API token'} 설정 후 프로젝트 연결`);
  }

  if (diags.railwayDiag.configured) {
    steps.push({ provider: 'railway', action: 'link_project', status: 'ready' });
  } else {
    const draft = buildRailwayBootstrapDraft(space);
    steps.push({ provider: 'railway', action: 'bootstrap_draft', status: 'draft_only', draft });
    manualActions.push(`Railway: ${diags.railwayDiag.missing?.join(', ') || 'API token'} 설정 후 서비스 연결`);
  }

  return {
    project_id: space.project_id,
    label: space.human_label,
    steps,
    manual_actions: manualActions,
    bootstrap_status: manualActions.length === 0 ? 'all_ready' : 'partial_manual',
    created_at: new Date().toISOString(),
  };
}

export function renderBootstrapPlanForSlack(plan) {
  const lines = [
    `*[프로젝트 Bootstrap]*`,
    `\`${plan.project_id}\` · ${plan.label}`,
    `bootstrap: \`${plan.bootstrap_status}\``,
    '',
    '*Provider 설정 현황*',
  ];

  for (const step of plan.steps) {
    const icon = step.status === 'ready' ? '✅' : step.status === 'draft_only' ? '📋' : '👤';
    lines.push(`${icon} \`${step.provider}\`: ${step.action} — ${step.status}${step.note ? ` (${step.note})` : ''}`);
  }

  if (plan.manual_actions.length) {
    lines.push('', '*수동 조치 필요*');
    for (const ma of plan.manual_actions) {
      lines.push(`- ${ma}`);
    }
  }

  return lines.join('\n');
}
