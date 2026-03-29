/**
 * Execution Outbound Orchestrator — execution_run → GitHub / Cursor / Supabase bridge.
 *
 * This is the canonical bridge between execution_run state and external tool adapters.
 * It inspects workstream lanes, creates deterministic outbound steps, and attaches
 * artifact metadata back into the run.
 *
 * executionRun.js = state/object layer (unchanged)
 * This module = outbound orchestration logic
 */

import fs from 'fs/promises';
import path from 'path';
import {
  getExecutionRunById,
  attachRunArtifact,
  updateRunGitTrace,
  updateLaneOutbound,
  appendCursorTrace,
  appendSupabaseTrace,
} from './executionRun.js';
import {
  isGithubAuthConfigured,
  resolveGitHubRepoTarget,
  createIssueArtifact,
  getGithubAuthMode,
} from '../adapters/githubAdapter.js';

/* ------------------------------------------------------------------ */
/*  Outbound event logger                                              */
/* ------------------------------------------------------------------ */

function logOutbound(event, fields = {}) {
  try {
    console.info(JSON.stringify({ stage: event, ts: new Date().toISOString(), ...fields }));
  } catch { /* never crash on diagnostics */ }
}

/* ------------------------------------------------------------------ */
/*  DB-work detection heuristic                                        */
/* ------------------------------------------------------------------ */

const DB_PATTERNS = [
  /supabase/i, /database/i, /schema/i, /migration/i, /table/i, /column/i,
  /RLS/i, /policy/i, /스키마/i, /테이블/i, /데이터/i, /DB/i, /저장/i,
  /backend.*persist/i, /auth.*store/i, /user.*model/i,
];

function impliesDbWork(run) {
  const haystack = [
    run.project_goal,
    run.locked_mvp_summary,
    ...(run.includes || []),
    ...(run.workstreams || []).map((w) => w.objective),
  ].join(' ');
  return DB_PATTERNS.some((re) => re.test(haystack));
}

/* ------------------------------------------------------------------ */
/*  PHASE 2 — GitHub Outbound                                          */
/* ------------------------------------------------------------------ */

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * @param {object} run
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{ mode: 'live'|'draft'|'error', issue_id?: number|string, issue_url?: string, branch_name?: string, error_summary?: string }>}
 */
export async function ensureGithubIssueForRun(run, metadata = {}) {
  const branchName = `feat/${slugify(run.project_goal || run.originating_task_kind || 'execution')}`;

  logOutbound('outbound_dispatch_started', {
    run_id: run.run_id, packet_id: run.packet_id,
    playbook_id: run.originating_playbook_id,
    lane_type: 'fullstack_swe', provider: 'github', mode: 'attempt',
  });

  if (!isGithubAuthConfigured()) {
    const draftPayload = {
      kind: 'github_issue_draft',
      title: `[COS Run] ${String(run.project_goal || '').slice(0, 60)}`,
      body: buildGithubIssueBody(run),
      labels: ['cos-execution', run.originating_task_kind || 'task'].filter(Boolean),
      suggested_branch: branchName,
      run_id: run.run_id,
      packet_id: run.packet_id,
    };

    attachRunArtifact(run.run_id, 'fullstack_swe', {
      github_issue_id: null,
      github_issue_url: null,
      github_draft_payload: draftPayload,
      branch_name: branchName,
    });
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'github', status: 'drafted', ref_ids: [], error: null,
    });
    updateRunGitTrace(run.run_id, { branch: branchName });

    logOutbound('outbound_dispatch_succeeded', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'github', mode: 'draft',
    });

    return { mode: 'draft', branch_name: branchName };
  }

  const repoTarget = resolveGitHubRepoTarget({ repoKey: '' });
  if (!repoTarget) {
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'github', status: 'manual_required', error: 'GITHUB_DEFAULT_OWNER/REPO not set',
    });
    logOutbound('outbound_dispatch_failed', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'github', error: 'repo_target_unresolved',
    });
    return { mode: 'error', error_summary: 'GitHub default repo not configured', branch_name: branchName };
  }

  try {
    const workItem = {
      id: run.run_id,
      project_key: run.originating_task_kind || 'cos-execution',
      title: String(run.project_goal || '').slice(0, 70),
      brief: run.locked_mvp_summary || run.project_goal || '',
      acceptance_criteria: (run.includes || []).slice(0, 10),
      work_type: 'feature',
      priority: 'high',
      source_channel: metadata.channel || 'slack',
      source_message_ts: metadata.thread_ts || '',
      github_artifacts: [],
    };

    const result = await createIssueArtifact({
      workItem,
      repoTarget,
      metadata: { user: run.requested_by || '', runId: run.run_id },
    });

    if (result.ok) {
      const a = result.artifact;
      attachRunArtifact(run.run_id, 'fullstack_swe', {
        github_issue_id: a.issue_number || a.issue_id,
        github_issue_url: a.issue_url,
        branch_name: branchName,
      });
      updateRunGitTrace(run.run_id, {
        repo: `${repoTarget.owner}/${repoTarget.repo}`,
        issue_id: String(a.issue_number || a.issue_id),
        branch: branchName,
      });
      updateLaneOutbound(run.run_id, 'fullstack_swe', {
        provider: 'github',
        status: 'dispatched',
        ref_ids: [String(a.issue_number || a.issue_id), a.issue_url].filter(Boolean),
        error: null,
      });

      logOutbound('outbound_dispatch_succeeded', {
        run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'github', mode: 'live',
        issue_id: a.issue_number || a.issue_id, issue_url: a.issue_url,
      });
      logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'fullstack_swe', artifact: 'github_issue' });
      logOutbound('git_trace_updated', { run_id: run.run_id, repo: `${repoTarget.owner}/${repoTarget.repo}`, issue_id: a.issue_number });

      return {
        mode: 'live',
        issue_id: a.issue_number || a.issue_id,
        issue_url: a.issue_url,
        branch_name: branchName,
      };
    }

    throw new Error('createIssueArtifact returned ok=false');
  } catch (err) {
    const summary = String(err?.message || err).slice(0, 300);
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'github', status: 'failed', error: summary,
    });
    attachRunArtifact(run.run_id, 'fullstack_swe', { branch_name: branchName });
    updateRunGitTrace(run.run_id, { branch: branchName });

    logOutbound('outbound_dispatch_failed', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'github', error: summary,
    });

    return { mode: 'error', error_summary: summary, branch_name: branchName };
  }
}

function buildGithubIssueBody(run) {
  const lines = [
    '## COS Execution Run',
    '',
    `**run_id**: \`${run.run_id}\``,
    `**packet_id**: \`${run.packet_id}\``,
    run.originating_playbook_id ? `**playbook**: \`${run.originating_playbook_id}\`` : null,
    run.originating_task_kind ? `**task_kind**: \`${run.originating_task_kind}\`` : null,
    '',
    '## Goal',
    run.project_goal || '(goal not set)',
    '',
    '## Locked MVP Summary',
    run.locked_mvp_summary || '(not set)',
    '',
    '## Includes',
    ...(run.includes || []).map((i) => `- ${i}`),
    '',
    '## Excludes',
    ...(run.excludes || []).map((e) => `- ${e}`),
    '',
    '## Deferred',
    ...(run.deferred_items || []).map((d) => `- ${d}`),
    '',
    '## Workstreams',
    ...(run.workstreams || []).map((w) => `- **${w.lane_type}**: ${w.objective.slice(0, 120)}`),
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/* ------------------------------------------------------------------ */
/*  PHASE 3 — Cursor Outbound                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate a machine-readable Cursor handoff artifact and write to disk.
 * @param {object} run
 * @returns {Promise<{ mode: 'created'|'error', handoff_path?: string, error_summary?: string }>}
 */
export async function ensureCursorHandoffForRun(run) {
  logOutbound('outbound_dispatch_started', {
    run_id: run.run_id, packet_id: run.packet_id,
    lane_type: 'fullstack_swe', provider: 'cursor',
  });

  try {
    const sweLane = (run.workstreams || []).find((w) => w.lane_type === 'fullstack_swe');
    const qaLane = (run.workstreams || []).find((w) => w.lane_type === 'qa_qc');

    const slug = slugify(run.originating_task_kind || run.project_goal || 'exec');
    const filename = `COS_Exec_Handoff_${slug}_${run.run_id.replace(/[^a-zA-Z0-9-]/g, '')}.md`;
    const handoffDir = path.resolve(process.cwd(), 'docs', 'cursor-handoffs');
    const handoffPath = path.join(handoffDir, filename);
    const relPath = `docs/cursor-handoffs/${filename}`;

    const content = [
      `# COS Execution Handoff — ${run.run_id}`,
      '',
      `**Generated**: ${new Date().toISOString()}`,
      `**run_id**: \`${run.run_id}\``,
      `**packet_id**: \`${run.packet_id}\``,
      run.originating_playbook_id ? `**playbook_id**: \`${run.originating_playbook_id}\`` : null,
      run.originating_task_kind ? `**task_kind**: \`${run.originating_task_kind}\`` : null,
      '',
      '---',
      '',
      '## Locked Scope',
      '',
      `**Goal**: ${run.project_goal || '(not set)'}`,
      '',
      `**MVP Summary**: ${run.locked_mvp_summary || '(not set)'}`,
      '',
      '### Includes',
      ...(run.includes || []).map((i) => `- ${i}`),
      (run.includes || []).length === 0 ? '- (none specified)' : null,
      '',
      '### Excludes',
      ...(run.excludes || []).map((e) => `- ${e}`),
      (run.excludes || []).length === 0 ? '- (none specified)' : null,
      '',
      '### Deferred',
      ...(run.deferred_items || []).map((d) => `- ${d}`),
      (run.deferred_items || []).length === 0 ? '- (none)' : null,
      '',
      '---',
      '',
      '## Workstream: fullstack_swe',
      '',
      `**Objective**: ${sweLane?.objective || '(not set)'}`,
      '',
      `**Dependencies**: ${(sweLane?.dependencies || []).join(', ') || 'none'}`,
      '',
      `**Done criteria**: ${sweLane?.done_criteria || 'PR seed + schema draft ready'}`,
      '',
      '## Workstream: qa_qc',
      '',
      `**Objective**: ${qaLane?.objective || '(not set)'}`,
      '',
      `**Done criteria**: ${qaLane?.done_criteria || 'test checklist + smoke cases delivered'}`,
      '',
      '---',
      '',
      '## Requirements for Cursor Agent',
      '',
      '1. Read locked scope above',
      '2. Implement minimum viable changes',
      '3. Keep existing flows compatible',
      '4. Create tests for new functionality',
      '5. Update handoff docs if behavior changes',
      '',
      '## Result Reporting',
      '',
      '1. Changed files list',
      '2. Key changes summary',
      '3. Test results',
      '4. Remaining risks',
      '5. Handoff/doc updates',
      '',
      '---',
      '',
      `_Auto-generated by COS Execution Outbound Orchestrator for \`${run.run_id}\`_`,
    ].filter((l) => l !== null).join('\n');

    await fs.mkdir(handoffDir, { recursive: true });
    await fs.writeFile(handoffPath, content, 'utf8');

    attachRunArtifact(run.run_id, 'fullstack_swe', { cursor_handoff_path: relPath });
    updateRunGitTrace(run.run_id, { generated_cursor_handoff_path: relPath });
    appendCursorTrace(run.run_id, {
      dispatch_mode: 'auto_generated',
      handoff_path: relPath,
      status: 'created',
    });
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'cursor', status: 'drafted', ref_ids: [relPath], error: null,
    });

    logOutbound('outbound_dispatch_succeeded', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'cursor', mode: 'created',
      handoff_path: relPath,
    });
    logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'fullstack_swe', artifact: 'cursor_handoff' });
    logOutbound('cursor_trace_updated', { run_id: run.run_id, handoff_path: relPath });

    return { mode: 'created', handoff_path: relPath };
  } catch (err) {
    const summary = String(err?.message || err).slice(0, 300);
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'cursor', status: 'failed', error: summary,
    });
    logOutbound('outbound_dispatch_failed', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'cursor', error: summary,
    });
    return { mode: 'error', error_summary: summary };
  }
}

/* ------------------------------------------------------------------ */
/*  PHASE 4 — Supabase Outbound                                       */
/* ------------------------------------------------------------------ */

/**
 * Generate Supabase schema draft payload if DB work implied.
 * @param {object} run
 * @returns {Promise<{ mode: 'created'|'skipped'|'error', draft_path?: string, error_summary?: string }>}
 */
export async function ensureSupabaseDraftForRun(run) {
  if (!impliesDbWork(run)) {
    logOutbound('outbound_dispatch_started', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'supabase', mode: 'skipped',
      reason: 'no_db_work_implied',
    });
    return { mode: 'skipped' };
  }

  logOutbound('outbound_dispatch_started', {
    run_id: run.run_id, packet_id: run.packet_id,
    lane_type: 'fullstack_swe', provider: 'supabase',
  });

  try {
    const slug = slugify(run.originating_task_kind || run.project_goal || 'exec');
    const filename = `supabase_draft_${slug}_${run.run_id.replace(/[^a-zA-Z0-9-]/g, '')}.json`;
    const draftDir = path.resolve(process.cwd(), 'data', 'supabase-drafts');
    const draftPath = path.join(draftDir, filename);
    const relPath = `data/supabase-drafts/${filename}`;

    const draftPayload = {
      kind: 'supabase_schema_draft',
      run_id: run.run_id,
      packet_id: run.packet_id,
      task_kind: run.originating_task_kind || null,
      project_goal: run.project_goal,
      locked_mvp_summary: run.locked_mvp_summary,
      includes: run.includes || [],
      generated_at: new Date().toISOString(),
      status: 'draft',
      tables: [],
      policies: [],
      functions: [],
      storage_buckets: [],
      notes: 'Auto-generated draft. Fill in concrete schema after research/design phase.',
    };

    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(draftPath, JSON.stringify(draftPayload, null, 2), 'utf8');

    attachRunArtifact(run.run_id, 'fullstack_swe', { supabase_schema_draft_path: relPath });
    appendSupabaseTrace(run.run_id, {
      kind: 'schema_draft',
      draft_path: relPath,
      status: 'drafted',
    });
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'supabase', status: 'drafted', ref_ids: [relPath], error: null,
    });

    logOutbound('outbound_dispatch_succeeded', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'supabase', mode: 'created',
      draft_path: relPath,
    });
    logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'fullstack_swe', artifact: 'supabase_schema_draft' });
    logOutbound('supabase_trace_updated', { run_id: run.run_id, draft_path: relPath });

    return { mode: 'created', draft_path: relPath };
  } catch (err) {
    const summary = String(err?.message || err).slice(0, 300);
    updateLaneOutbound(run.run_id, 'fullstack_swe', {
      provider: 'supabase', status: 'failed', error: summary,
    });
    logOutbound('outbound_dispatch_failed', {
      run_id: run.run_id, lane_type: 'fullstack_swe', provider: 'supabase', error: summary,
    });
    return { mode: 'error', error_summary: summary };
  }
}

/* ------------------------------------------------------------------ */
/*  Research / UIUX / QA artifact seeds                                */
/* ------------------------------------------------------------------ */

/**
 * @param {object} run
 * @returns {{ mode: 'seeded' }}
 */
export function seedResearchArtifact(run) {
  const slug = slugify(run.originating_task_kind || run.project_goal || 'research');
  const relPath = `docs/research-notes/research_${slug}_${run.run_id.replace(/[^a-zA-Z0-9-]/g, '')}.md`;

  attachRunArtifact(run.run_id, 'research_benchmark', {
    research_note_id: `RN-${run.run_id}`,
    research_note_path: relPath,
  });
  updateLaneOutbound(run.run_id, 'research_benchmark', {
    provider: 'internal', status: 'drafted', ref_ids: [relPath], error: null,
  });

  logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'research_benchmark', artifact: 'research_note' });
  return { mode: 'seeded' };
}

export function seedUiuxArtifacts(run) {
  const slug = slugify(run.originating_task_kind || run.project_goal || 'uiux');
  const base = `docs/design-specs/uiux_${slug}_${run.run_id.replace(/[^a-zA-Z0-9-]/g, '')}`;

  attachRunArtifact(run.run_id, 'uiux_design', {
    ui_spec_delta_path: `${base}_spec.md`,
    wireframe_note_path: `${base}_wireframe.md`,
    component_checklist_path: `${base}_components.md`,
  });
  updateLaneOutbound(run.run_id, 'uiux_design', {
    provider: 'internal', status: 'drafted', ref_ids: [`${base}_spec.md`], error: null,
  });

  logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'uiux_design', artifact: 'ui_spec_delta' });
  return { mode: 'seeded' };
}

export function seedQaArtifacts(run) {
  const slug = slugify(run.originating_task_kind || run.project_goal || 'qa');
  const base = `docs/qa-specs/qa_${slug}_${run.run_id.replace(/[^a-zA-Z0-9-]/g, '')}`;

  attachRunArtifact(run.run_id, 'qa_qc', {
    acceptance_checklist_path: `${base}_acceptance.md`,
    regression_case_list_path: `${base}_regression.md`,
    smoke_test_plan_path: `${base}_smoke.md`,
  });
  updateLaneOutbound(run.run_id, 'qa_qc', {
    provider: 'internal', status: 'drafted', ref_ids: [`${base}_acceptance.md`], error: null,
  });

  logOutbound('artifact_attached', { run_id: run.run_id, lane_type: 'qa_qc', artifact: 'qa_checklist' });
  return { mode: 'seeded' };
}

/* ------------------------------------------------------------------ */
/*  Top-level orchestration entrypoints                                */
/* ------------------------------------------------------------------ */

/**
 * Plan outbound actions for all lanes in a run.
 * @param {object} run
 * @returns {{ lane_type: string, provider: string, action: string }[]}
 */
export function planOutboundActionsForRun(run) {
  const plan = [];

  plan.push({ lane_type: 'research_benchmark', provider: 'internal', action: 'seed_research_note' });
  plan.push({ lane_type: 'fullstack_swe', provider: 'github', action: isGithubAuthConfigured() ? 'create_issue_live' : 'create_issue_draft' });
  plan.push({ lane_type: 'fullstack_swe', provider: 'cursor', action: 'generate_handoff' });

  if (impliesDbWork(run)) {
    plan.push({ lane_type: 'fullstack_swe', provider: 'supabase', action: 'generate_schema_draft' });
  }

  plan.push({ lane_type: 'uiux_design', provider: 'internal', action: 'seed_uiux_artifacts' });
  plan.push({ lane_type: 'qa_qc', provider: 'internal', action: 'seed_qa_artifacts' });

  return plan;
}

/**
 * Dispatch all outbound actions for a run.
 * @param {object} run
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{ github: object, cursor: object, supabase: object, research: object, uiux: object, qa: object }>}
 */
export async function dispatchOutboundActionsForRun(run, metadata = {}) {
  const results = {};

  results.research = seedResearchArtifact(run);
  results.uiux = seedUiuxArtifacts(run);
  results.qa = seedQaArtifacts(run);

  results.github = await ensureGithubIssueForRun(run, metadata);
  results.cursor = await ensureCursorHandoffForRun(run);
  results.supabase = await ensureSupabaseDraftForRun(run);

  return results;
}

/**
 * Dispatch a single workstream lane.
 * @param {object} run
 * @param {string} laneType
 * @param {Record<string, unknown>} metadata
 */
export async function dispatchWorkstream(run, laneType, metadata = {}) {
  switch (laneType) {
    case 'research_benchmark':
      return seedResearchArtifact(run);
    case 'fullstack_swe': {
      const gh = await ensureGithubIssueForRun(run, metadata);
      const cursor = await ensureCursorHandoffForRun(run);
      const supa = await ensureSupabaseDraftForRun(run);
      return { github: gh, cursor, supabase: supa };
    }
    case 'uiux_design':
      return seedUiuxArtifacts(run);
    case 'qa_qc':
      return seedQaArtifacts(run);
    default:
      return { mode: 'unknown_lane' };
  }
}

/**
 * Collect outbound status summary for a run.
 * @param {string} runId
 * @returns {{ run_id: string, lanes: { lane_type: string, outbound_provider: string | null, outbound_status: string, outbound_ref_ids: string[], last_error: string | null }[] } | null}
 */
export function collectOutboundStatus(runId) {
  const run = getExecutionRunById(runId);
  if (!run) return null;

  const lanes = (run.workstreams || []).map((w) => ({
    lane_type: w.lane_type,
    outbound_provider: w.outbound?.outbound_provider || null,
    outbound_status: w.outbound?.outbound_status || 'pending',
    outbound_ref_ids: w.outbound?.outbound_ref_ids || [],
    last_error: w.outbound?.last_error || null,
  }));

  return { run_id: runId, lanes };
}

/**
 * Format outbound status for representative-facing surface.
 * @param {string} runId
 */
export function formatOutboundStatusForSlack(runId) {
  const status = collectOutboundStatus(runId);
  if (!status) return '(실행 런을 찾을 수 없습니다)';

  const run = getExecutionRunById(runId);
  const lines = [
    `*[Outbound 오케스트레이션 현황]*`,
    `\`${runId}\`${run?.originating_task_kind ? ` · \`${run.originating_task_kind}\`` : ''}`,
    '',
  ];

  for (const lane of status.lanes) {
    const statusIcon = {
      pending: '⏳', drafted: '📋', dispatched: '🚀',
      completed: '✅', manual_required: '👤', blocked: '🚫', failed: '❌',
    }[lane.outbound_status] || '❓';

    const refs = lane.outbound_ref_ids.length
      ? ` → ${lane.outbound_ref_ids.slice(0, 2).join(', ')}`
      : '';

    const errNote = lane.last_error ? ` _err: ${lane.last_error.slice(0, 80)}_` : '';

    lines.push(`${statusIcon} \`${lane.lane_type}\`: ${lane.outbound_status}${lane.outbound_provider ? ` (${lane.outbound_provider})` : ''}${refs}${errNote}`);
  }

  if (run?.git_trace) {
    const gt = run.git_trace;
    const gitParts = [];
    if (gt.repo) gitParts.push(`repo: \`${gt.repo}\``);
    if (gt.issue_id) gitParts.push(`issue: \`#${gt.issue_id}\``);
    if (gt.branch) gitParts.push(`branch: \`${gt.branch}\``);
    if (gt.generated_cursor_handoff_path) gitParts.push(`cursor: \`${gt.generated_cursor_handoff_path}\``);
    if (gitParts.length) {
      lines.push('', '*Git trace*', gitParts.map((p) => `- ${p}`).join('\n'));
    }
  }

  return lines.join('\n');
}
