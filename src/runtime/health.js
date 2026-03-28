import {
  DATA_DIR,
} from '../storage/paths.js';
import { getRuntimeMode } from './env.js';
import { getEnvironmentProfile, getDefaultEnvKey } from '../storage/environmentProfiles.js';
import { getRepoForProjectEnv } from '../storage/repoRegistry.js';
import { getDbForProjectEnv } from '../storage/supabaseRegistry.js';
import { getAutomationSettings } from '../automation/index.js';
import { validateEnv } from './env.js';
import { getStoreCore } from '../storage/core/index.js';
import { COLLECTION_NAMES } from '../storage/core/types.js';

export async function collectHealthSnapshot({ model, projectKey = null, envKey = null, channelId = null }) {
  const store = getStoreCore();
  const [approvals, works, runs, plans] = await Promise.all([
    store.list('approvals'),
    store.list('work_items'),
    store.list('work_runs'),
    store.list('plans'),
  ]);
  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const blockedWorks = works.filter((w) => w.status === 'blocked').length;
  const runningRuns = runs.filter((r) => r.status === 'running').length;
  const effectiveEnvKey = envKey || getDefaultEnvKey();
  const envProfile = await getEnvironmentProfile(effectiveEnvKey);
  const resolvedRepo = projectKey ? await getRepoForProjectEnv(projectKey, effectiveEnvKey) : null;
  const resolvedDb = projectKey ? await getDbForProjectEnv(projectKey, effectiveEnvKey) : null;

  const envCheck = validateEnv();
  const automation = await getAutomationSettings();
  const storageMode = store.storage_mode;
  const supabaseConfigured = store.supabase_configured;
  const migrationReadiness = supabaseConfigured ? 'ready' : 'not_ready';

  let supabaseConnectivityActual = null;
  let supabasePlansConnectivity = null;
  try {
    if (supabaseConfigured) {
      supabaseConnectivityActual = await store.checkSupabaseConnectivity('g1cos_work_items');
      supabasePlansConnectivity = await store.checkSupabaseConnectivity('g1cos_plans');
    }
  } catch (e) {
    supabaseConnectivityActual = { ok: false, error: String(e?.message || e) };
    supabasePlansConnectivity = { ok: false, error: String(e?.message || e) };
  }
  const hostedReadiness =
    getRuntimeMode() !== 'hosted' ? 'not_ready' : envCheck.ok ? 'ready' : 'not_ready_env_missing';

  return {
    runtime_mode: getRuntimeMode(),
    model,
    socket_mode: true,
    data_dir: DATA_DIR,
    env_key: effectiveEnvKey,
    env_profile: {
      display_name: envProfile.display_name,
      runtime_mode: envProfile.runtime_mode,
      risk_level: envProfile.risk_level,
      change_policy: envProfile.change_policy,
    },
    resolved_repo: resolvedRepo,
    resolved_db: resolvedDb,
    env_missing: envCheck.missing,
    automation_enabled_jobs: automation.enabled_jobs || [],
    hosted_readiness: hostedReadiness,
    storage_mode: storageMode,
    supabase_configured: supabaseConfigured,
    supabase_connectivity_actual: supabaseConnectivityActual,
    supabase_plans_connectivity: supabasePlansConnectivity,
    storage_read_preference: store.storage_read_preference,
    live_dual_write_collections: store.live_dual_write_collections || [],
    storage_migration_readiness: migrationReadiness,
    storage_collection_coverage: {
      expected_collections: COLLECTION_NAMES.length,
      mapped_collections: COLLECTION_NAMES.length,
    },
    counts: {
      approvals_total: approvals.length,
      approvals_pending: pendingApprovals,
      works_total: works.length,
      works_blocked: blockedWorks,
      runs_total: runs.length,
      runs_running: runningRuns,
      plans_total: plans.length,
    },
  };
}

export function formatHealthSnapshot(snapshot) {
  return [
    '상태점검',
    `- runtime_mode: ${snapshot.runtime_mode}`,
    `- model: ${snapshot.model}`,
    `- socket_mode: ${snapshot.socket_mode ? 'true' : 'false'}`,
    `- data_dir: ${snapshot.data_dir}`,
    `- env profile: ${snapshot.env_key} (${snapshot.env_profile?.display_name || 'unknown'})`,
    `- repo resolved: ${snapshot.resolved_repo || 'manual'}`,
    `- db resolved: ${snapshot.resolved_db || 'manual'}`,
    `- hosted readiness: ${snapshot.hosted_readiness}`,
    `- storage mode: ${snapshot.storage_mode}`,
    `- supabase configured: ${snapshot.supabase_configured ? 'yes' : 'no'}`,
    `- supabase connectivity (work_items): ${
      snapshot.supabase_connectivity_actual?.ok ? 'pass' : 'fail'
    }${snapshot.supabase_connectivity_actual?.ok ? '' : ` (${snapshot.supabase_connectivity_actual?.error || 'error'})`}`,
    `- supabase connectivity (plans): ${
      snapshot.supabase_plans_connectivity?.ok ? 'pass' : 'fail'
    }${snapshot.supabase_plans_connectivity?.ok ? '' : ` (${snapshot.supabase_plans_connectivity?.error || 'error'})`}`,
    `- storage read preference: ${snapshot.storage_read_preference}`,
    `- live dual-write collections: ${snapshot.live_dual_write_collections?.length ? snapshot.live_dual_write_collections.join(', ') : 'none'}`,
    `- migration readiness: ${snapshot.storage_migration_readiness}`,
    `- required env missing: ${snapshot.env_missing?.length ? snapshot.env_missing.join(', ') : '없음'}`,
    `- automation enabled jobs: ${snapshot.automation_enabled_jobs?.length ? snapshot.automation_enabled_jobs.join(', ') : '없음'}`,
    '- 카운트',
    `  - approvals: total=${snapshot.counts.approvals_total}, pending=${snapshot.counts.approvals_pending}`,
    `  - works: total=${snapshot.counts.works_total}, blocked=${snapshot.counts.works_blocked}`,
    `  - runs: total=${snapshot.counts.runs_total}, running=${snapshot.counts.runs_running}`,
    `  - plans: total=${snapshot.counts.plans_total}`,
  ].join('\n');
}
