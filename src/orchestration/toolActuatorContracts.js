/**
 * vNext.12 — Tool actuators: truth fields COS must read (not agent prose).
 */

/** @typedef {'github'|'cursor_cloud'|'supabase_dispatch'|'vercel'|'railway'|'internal_artifact'|'observe_only'} ToolKey */

/**
 * @param {string} provider
 * @returns {string[]}
 */
export function expectedTruthRefKeysForProvider(provider) {
  switch (provider) {
    case 'github':
      return ['github_issue_id', 'github_issue_url', 'github_draft_payload', 'branch_name'];
    case 'cursor_cloud':
      return ['cursor_cloud_run_ref', 'cursor_handoff_path', 'cursor_conversation_url'];
    case 'supabase_dispatch':
      return ['supabase_schema_draft_path', 'supabase_migration_file_path', 'supabase_live_apply_ref'];
    case 'vercel':
      return ['vercel_deploy_packet_path', 'vercel_preview_url'];
    case 'railway':
      return ['railway_deploy_packet_path', 'railway_deploy_url'];
    case 'internal_artifact':
      return ['artifact_paths'];
    case 'observe_only':
      return ['observe_summary_path'];
    default:
      return [];
  }
}

/**
 * @param {string} provider
 * @returns {string}
 */
export function truthSourceLabel(provider) {
  const m = {
    github: 'github_api_and_repo_refs',
    cursor_cloud: 'cursor_launch_or_handoff_trace',
    supabase_dispatch: 'supabase_draft_or_apply_trace',
    vercel: 'vercel_project_readiness_packet',
    railway: 'railway_service_readiness_packet',
    internal_artifact: 'repo_artifact_files',
    observe_only: 'readiness_snapshot_only',
  };
  return m[provider] || 'unknown';
}
