/**
 * Project Space Bootstrap — 새 프로젝트 요청 시 bootstrap plan 생성 + draft-first adapters 연결.
 * Thread-linked space가 최우선; 라벨 재사용은 exact + 안전 조건에서만 (유사도 점수만으로는 재사용 안 함).
 */

import {
  createProjectSpace,
  getProjectSpaceByThread,
  linkThreadToProjectSpace,
  updateProjectSpace,
  getProjectSpaceById,
  computeGoalFingerprint,
  findExactLabelOrAliasMatches,
  spaceHasActiveRunOnOtherThread,
  getRelatedSpaceCandidatesForTrace,
  touchProjectSpaceLaunchMeta,
  countDistinctThreadsForSpace,
} from './projectSpaceRegistry.js';
import { diagnoseGithubConfig } from './executionDispatchLifecycle.js';
import { diagnoseVercelReadiness, buildVercelBootstrapDraft } from '../adapters/vercelAdapter.js';
import { diagnoseRailwayReadiness, buildRailwayBootstrapDraft } from '../adapters/railwayAdapter.js';

function logBootstrap(event, fields = {}) {
  try {
    console.info(JSON.stringify({ stage: event, ts: new Date().toISOString(), ...fields }));
  } catch { /* */ }
}

/** @typedef {'thread_linked'|'explicit_project_id'|'explicit_project_label_exact'|'label_match_reuse'|'new_bootstrap'} ProjectSpaceResolutionMode */

/**
 * @param {object} space
 * @param {string} threadKey
 * @param {string} goalFp
 * @returns {{ ok: boolean, reason: string }}
 */
function canReuseSpaceForConservativeLabelMatch(space, threadKey, goalFp) {
  if (spaceHasActiveRunOnOtherThread(space, threadKey)) {
    return { ok: false, reason: 'active_run_on_other_thread' };
  }
  const owners = space.owner_thread_ids || [];
  const otherThreads = owners.filter((t) => t !== threadKey);
  if (otherThreads.length > 0) {
    return { ok: false, reason: 'space_owned_by_other_thread' };
  }
  if (
    goalFp &&
    space.last_goal_fingerprint &&
    space.last_goal_fingerprint !== goalFp
  ) {
    return { ok: false, reason: 'goal_fingerprint_mismatch' };
  }
  return { ok: true, reason: 'exact_label_or_alias_safe' };
}

/**
 * @param {Array<{ space: object, match_kind: string }>} matches
 * @param {string} threadKey
 * @param {string} goalFp
 */
function pickLabelReuseSpace(matches, threadKey, goalFp) {
  const scored = [];
  for (const { space, match_kind } of matches) {
    const gate = canReuseSpaceForConservativeLabelMatch(space, threadKey, goalFp);
    if (!gate.ok) continue;
    let conf = match_kind === 'label_exact' ? 0.9 : 0.85;
    if (goalFp && space.last_goal_fingerprint === goalFp) conf += 0.08;
    scored.push({
      space,
      match_kind,
      gate,
      resolution_confidence: Math.min(conf, 1),
      updated_at: space.updated_at || '',
    });
  }
  scored.sort((a, b) => {
    if (b.resolution_confidence !== a.resolution_confidence) {
      return b.resolution_confidence - a.resolution_confidence;
    }
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });
  return scored[0] || null;
}

/**
 * Idempotent bootstrap: thread-linked → explicit id → exact 라벨/alias(안전할 때만) → 신규 생성.
 * @returns {{ space: object, reused: boolean, resolution: object }}
 */
export function getOrCreateProjectSpaceForBootstrap(opts = {}) {
  const threadKey = opts.threadKey || '';
  const label = opts.label || '';
  const goalFp = computeGoalFingerprint(label);
  const relatedCandidates = label.trim() ? getRelatedSpaceCandidatesForTrace(label, 5) : [];
  const hadExactCandidates = findExactLabelOrAliasMatches(label).length > 0;

  const baseResolution = (extra) => ({
    related_space_candidates: relatedCandidates,
    goal_fingerprint: goalFp,
    ...extra,
  });

  if (opts.projectId) {
    const s = getProjectSpaceById(String(opts.projectId));
    if (s) {
      logBootstrap('bootstrap_reused_explicit_id', { project_id: s.project_id });
      return {
        space: s,
        reused: true,
        resolution: baseResolution({
          project_space_resolution_mode: 'explicit_project_id',
          reused_space_project_id: s.project_id,
          reused_space_reason: 'opts.projectId',
          resolution_confidence: 1,
          active_thread_count: countDistinctThreadsForSpace(s),
        }),
      };
    }
  }

  if (threadKey) {
    const existing = getProjectSpaceByThread(threadKey);
    if (existing) {
      logBootstrap('bootstrap_reused_thread_linked', { project_id: existing.project_id });
      return {
        space: existing,
        reused: true,
        resolution: baseResolution({
          project_space_resolution_mode: 'thread_linked',
          reused_space_project_id: existing.project_id,
          reused_space_reason: 'thread_index_hit',
          resolution_confidence: 1,
          active_thread_count: countDistinctThreadsForSpace(existing),
        }),
      };
    }
  }

  if (label.trim()) {
    const matches = findExactLabelOrAliasMatches(label);
    const picked = pickLabelReuseSpace(matches, threadKey, goalFp);
    if (picked) {
      logBootstrap('bootstrap_reused_label_exact', {
        project_id: picked.space.project_id,
        match_kind: picked.match_kind,
      });
      return {
        space: picked.space,
        reused: true,
        resolution: baseResolution({
          project_space_resolution_mode:
            picked.match_kind === 'label_exact' ? 'explicit_project_label_exact' : 'label_match_reuse',
          reused_space_project_id: picked.space.project_id,
          reused_space_reason: picked.gate.reason,
          resolution_confidence: picked.resolution_confidence,
          label_match_kind: picked.match_kind,
          active_thread_count: countDistinctThreadsForSpace(picked.space),
        }),
      };
    }
  }

  const ghDiag = diagnoseGithubConfig();
  const vercelDiag = diagnoseVercelReadiness();
  const railwayDiag = diagnoseRailwayReadiness();

  const space = createProjectSpace({
    human_label: label || 'New Project',
    aliases: opts.aliases || [],
    canonical_summary: opts.summary || '',
    repo_owner: opts.repoOwner || process.env.GITHUB_DEFAULT_OWNER || null,
    repo_name: opts.repoName || null,
    github_ready_status: ghDiag.configured ? 'ready' : 'not_configured',
    cursor_workspace_root: opts.cursorRoot || process.cwd(),
    cursor_handoff_root: opts.cursorHandoffRoot || 'data/exec-handoffs',
    supabase_project_ref: opts.supabaseRef || null,
    supabase_url: opts.supabaseUrl || null,
    supabase_ready_status: opts.supabaseRef ? 'configured' : 'not_configured',
    vercel_project_id: opts.vercelProjectId || null,
    vercel_ready_status: vercelDiag.configured ? 'ready' : 'not_configured',
    railway_project_id: opts.railwayProjectId || null,
    railway_ready_status: railwayDiag.configured ? 'ready' : 'not_configured',
    bootstrap_source: opts.bootstrapSource || 'user_request',
    last_goal_fingerprint: goalFp || null,
  });

  let reason = 'no_prior_thread_or_exact_label';
  if (hadExactCandidates) reason = 'exact_match_failed_safety_or_fingerprint';

  return {
    space,
    reused: false,
    resolution: baseResolution({
      project_space_resolution_mode: 'new_bootstrap',
      reused_space_project_id: null,
      reused_space_reason: reason,
      resolution_confidence: 0.55,
      possible_related_spaces: relatedCandidates,
      active_thread_count: 0,
    }),
  };
}

/**
 * Build a bootstrap plan for a new project space. Idempotent — reuses
 * thread-linked or **exact** label/alias match only when isolation rules pass.
 * @param {{ label: string, aliases?: string[], threadKey?: string, repoOwner?: string, repoName?: string, metadata?: object, projectId?: string }} opts
 */
export function bootstrapProjectSpace(opts = {}) {
  const { space, reused, resolution } = getOrCreateProjectSpaceForBootstrap(opts);

  if (opts.threadKey) {
    linkThreadToProjectSpace(space.project_id, opts.threadKey);
    touchProjectSpaceLaunchMeta(space.project_id, {
      threadKey: opts.threadKey,
      goalFingerprint: resolution.goal_fingerprint || undefined,
    });
  } else if (resolution.goal_fingerprint) {
    updateProjectSpace(space.project_id, { last_goal_fingerprint: resolution.goal_fingerprint });
  }

  const ghDiag = diagnoseGithubConfig();
  const vercelDiag = diagnoseVercelReadiness();
  const railwayDiag = diagnoseRailwayReadiness();
  const plan = buildBootstrapPlan(space, { ghDiag, vercelDiag, railwayDiag });

  logBootstrap('project_space_bootstrapped', {
    project_id: space.project_id,
    label: space.human_label,
    reused,
    project_space_resolution_mode: resolution.project_space_resolution_mode,
  });

  return { space, plan, reused, resolution };
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
