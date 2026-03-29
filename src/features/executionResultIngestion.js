/**
 * Execution Result Ingestion — external tool outcomes (GitHub/Cursor/Supabase) back into execution_run.
 *
 * Each provider has a canonical ingest function that updates:
 * - execution_run.artifacts
 * - lane outbound metadata
 * - git_trace / cursor_trace / supabase_trace
 * - run.latest_report when appropriate
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
  updateRunReport,
} from './executionRun.js';

function logIngest(event, fields = {}) {
  try {
    console.info(JSON.stringify({ stage: event, ts: new Date().toISOString(), ...fields }));
  } catch { /* never crash on diagnostics */ }
}

/* ------------------------------------------------------------------ */
/*  GitHub Result Ingestion                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {string} runId
 * @param {{
 *   issue_id?: string|number,
 *   issue_url?: string,
 *   branch?: string,
 *   pr_id?: string|number,
 *   pr_url?: string,
 *   commit_sha?: string,
 *   sync_status?: 'acknowledged'|'completed'|'failed',
 * }} payload
 */
export function ingestGithubResult(runId, payload) {
  const run = getExecutionRunById(runId);
  if (!run) return { ok: false, error: 'run_not_found' };

  const artifacts = {};
  const gitTrace = {};

  if (payload.issue_id != null) {
    artifacts.github_issue_id = payload.issue_id;
    gitTrace.issue_id = String(payload.issue_id);
  }
  if (payload.issue_url) artifacts.github_issue_url = payload.issue_url;
  if (payload.branch) {
    artifacts.branch_name = payload.branch;
    gitTrace.branch = payload.branch;
  }
  if (payload.pr_id != null) {
    artifacts.pr_id = payload.pr_id;
    gitTrace.pr_id = String(payload.pr_id);
  }
  if (payload.pr_url) artifacts.pr_url = payload.pr_url;
  if (payload.commit_sha) gitTrace.commit_shas = [payload.commit_sha];

  if (Object.keys(artifacts).length) attachRunArtifact(runId, 'fullstack_swe', artifacts);
  if (Object.keys(gitTrace).length) updateRunGitTrace(runId, gitTrace);

  const status = payload.sync_status || 'acknowledged';
  updateLaneOutbound(runId, 'fullstack_swe', {
    provider: 'github',
    status,
    ref_ids: [payload.issue_url, payload.pr_url].filter(Boolean),
    error: status === 'failed' ? 'external_report_failed' : null,
  });

  logIngest('github_result_ingested', { run_id: runId, status, issue_id: payload.issue_id, pr_id: payload.pr_id });
  return { ok: true, status };
}

/* ------------------------------------------------------------------ */
/*  Cursor Result Ingestion                                            */
/* ------------------------------------------------------------------ */

/**
 * Ingest Cursor result from file drop or direct payload.
 * @param {string} runId
 * @param {{
 *   result_summary?: string,
 *   patch_summary?: string,
 *   handoff_path?: string,
 *   result_link?: string,
 *   changed_files?: string[],
 *   tests_passed?: boolean,
 *   remaining_risks?: string[],
 *   artifacts_created?: string[],
 *   followup_recommendation?: string,
 *   handoff_doc_updated?: boolean,
 *   status?: 'acknowledged'|'completed'|'failed',
 * }} payload
 */
export function ingestCursorResult(runId, payload) {
  const run = getExecutionRunById(runId);
  if (!run) return { ok: false, error: 'run_not_found' };

  const status = payload.status || 'completed';

  if (payload.handoff_path) {
    attachRunArtifact(runId, 'fullstack_swe', { cursor_handoff_path: payload.handoff_path });
    updateRunGitTrace(runId, { generated_cursor_handoff_path: payload.handoff_path });
  }

  appendCursorTrace(runId, {
    dispatch_mode: 'result_ingested',
    handoff_path: payload.handoff_path || run.artifacts?.fullstack_swe?.cursor_handoff_path || '',
    status,
    result_summary: payload.result_summary || payload.patch_summary || '',
    result_link: payload.result_link || '',
    changed_files: payload.changed_files || [],
    tests_passed: payload.tests_passed,
  });

  updateLaneOutbound(runId, 'fullstack_swe', {
    provider: 'cursor',
    status,
    ref_ids: [payload.handoff_path, payload.result_link].filter(Boolean),
    error: status === 'failed' ? (payload.result_summary || 'cursor_failed') : null,
  });

  if (payload.result_summary) {
    const reportSnippet = `[Cursor] ${payload.result_summary}${payload.changed_files?.length ? `\nChanged: ${payload.changed_files.join(', ')}` : ''}`;
    updateRunReport(runId, reportSnippet);
  }

  logIngest('cursor_result_ingested', { run_id: runId, status, changed_files_count: payload.changed_files?.length || 0 });
  return { ok: true, status };
}

/* ------------------------------------------------------------------ */
/*  Cursor Result File Drop Ingestion                                  */
/* ------------------------------------------------------------------ */

/**
 * Try to load a Cursor result from the conventional file-drop path.
 * @param {string} runId
 * @returns {Promise<{ ok: boolean, payload?: object, error?: string }>}
 */
export async function ingestCursorResultFromFile(runId) {
  const searchPaths = [
    path.resolve(process.cwd(), 'data', 'cursor-results', `${runId}.json`),
    path.resolve(process.cwd(), 'docs', 'cursor-results', `${runId}.json`),
  ];

  for (const fp of searchPaths) {
    try {
      const raw = await fs.readFile(fp, 'utf8');
      const payload = JSON.parse(raw);
      const result = ingestCursorResult(runId, payload);
      logIngest('cursor_file_drop_ingested', { run_id: runId, path: fp });
      return { ok: result.ok, payload };
    } catch {
      continue;
    }
  }

  return { ok: false, error: 'no_result_file_found' };
}

/* ------------------------------------------------------------------ */
/*  Supabase Result Ingestion                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {string} runId
 * @param {{
 *   draft_path?: string,
 *   migration_id?: string,
 *   migration_path?: string,
 *   apply_status?: 'draft_only'|'manual_apply'|'applied_result_ingested'|'failed',
 *   schema_summary?: string,
 *   sql_artifact_path?: string,
 * }} payload
 */
export function ingestSupabaseResult(runId, payload) {
  const run = getExecutionRunById(runId);
  if (!run) return { ok: false, error: 'run_not_found' };

  const status = payload.apply_status || 'acknowledged';

  const artifacts = {};
  if (payload.draft_path) artifacts.supabase_schema_draft_path = payload.draft_path;
  if (payload.sql_artifact_path) artifacts.supabase_sql_artifact_path = payload.sql_artifact_path;
  if (Object.keys(artifacts).length) attachRunArtifact(runId, 'fullstack_swe', artifacts);

  appendSupabaseTrace(runId, {
    kind: payload.migration_id ? 'migration_applied' : 'result_ingested',
    draft_path: payload.draft_path || run.artifacts?.fullstack_swe?.supabase_schema_draft_path || '',
    migration_id: payload.migration_id || null,
    migration_path: payload.migration_path || null,
    status,
    schema_summary: payload.schema_summary || '',
  });

  const outboundStatus = {
    draft_only: 'drafted',
    manual_apply: 'manual_required',
    applied_result_ingested: 'completed',
    failed: 'failed',
  }[status] || 'acknowledged';

  updateLaneOutbound(runId, 'fullstack_swe', {
    provider: 'supabase',
    status: outboundStatus,
    ref_ids: [payload.draft_path, payload.migration_path, payload.migration_id].filter(Boolean),
    error: status === 'failed' ? (payload.schema_summary || 'supabase_failed') : null,
  });

  if (payload.migration_id) {
    updateRunGitTrace(runId, { supabase_migration_ids: [payload.migration_id] });
  }

  logIngest('supabase_result_ingested', { run_id: runId, status, migration_id: payload.migration_id });
  return { ok: true, status };
}
