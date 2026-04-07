/**
 * One-shot boot connectivity truth (ops logs only, not founder-facing).
 */

import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getSupervisorLeaseBootMode } from './supervisorLease.js';
import { resolveGithubToken, parseGithubRepoFromEnv } from './toolsBridge.js';

/**
 * @param {NodeJS.ProcessEnv} env
 */
function supabaseEnvTruth(env) {
  const u = env.SUPABASE_URL;
  const k = env.SUPABASE_SERVICE_ROLE_KEY;
  const urlMissing = u === undefined || u === null;
  const keyMissing = k === undefined || k === null;
  const urlEmpty = !String(u ?? '').trim();
  const keyEmpty = !String(k ?? '').trim();
  let urlMalformed = false;
  if (!urlEmpty) {
    try {
      new URL(String(u).trim());
    } catch {
      urlMalformed = true;
    }
  }
  return { urlMissing, keyMissing, urlEmpty, keyEmpty, urlMalformed };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function logCosRuntimeTruthBoot(env = process.env) {
  const se = supabaseEnvTruth(env);
  console.info(
    JSON.stringify({
      event: 'cos_supabase_env_truth',
      supabase_url_missing: se.urlMissing,
      supabase_url_empty: se.urlEmpty,
      supabase_url_malformed: se.urlMalformed,
      supabase_service_role_key_missing: se.keyMissing,
      supabase_service_role_key_empty: se.keyEmpty,
    }),
  );

  const github_api_ready = Boolean(resolveGithubToken(env) && parseGithubRepoFromEnv(env));
  const supabase_run_store_ready = Boolean(createCosRuntimeSupabase());
  const supervisor_lease_mode = getSupervisorLeaseBootMode(env);
  const webhook_ingress_ready = String(env.COS_HTTP_DISABLED || '').trim() !== '1';

  console.info(
    JSON.stringify({
      event: 'cos_runtime_truth',
      github_api_ready,
      supabase_run_store_ready,
      supervisor_lease_mode,
      webhook_ingress_ready,
    }),
  );
}
