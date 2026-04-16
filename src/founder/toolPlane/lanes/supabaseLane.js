/**
 * Supabase external tool lane (apply_sql via RPC).
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { cosToolArtifactSubdir } from '../artifactSubdir.js';
import { hasRecentToolLiveCompleted } from '../../executionLedger.js';

function isPlausibleSupabaseUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return true;
  } catch {
    return false;
  }
}

export const SUPABASE_APPLY_SQL_RPC = 'cos_apply_sql';

export async function getSupabaseAdapterReadiness(env = process.env, options = {}) {
  const e = env || process.env;
  const threadKeyOpt = options.threadKey ? String(options.threadKey) : '';
  const url = String(e.SUPABASE_URL || '').trim();
  const key = String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  const urlOk = !!(url && isPlausibleSupabaseUrl(url));
  if (url && !urlOk) missing.push('SUPABASE_URL(invalid)');
  const declared = !!(url || key);
  const configured = !!(url && key && urlOk);
  const live_capable = configured;
  let contract_state = 'missing_env';
  if (!url || !key || !urlOk) contract_state = 'missing_env';
  else if (threadKeyOpt && (await hasRecentToolLiveCompleted(threadKeyOpt, 'supabase'))) {
    contract_state = 'verified_recent_success';
  } else {
    contract_state = 'env_ready_unverified';
  }
  const reason = !declared
    ? 'declared: 없음 → artifact/blocked'
    : !configured
      ? 'declared: URL·키 중 일부만 있거나 URL 무효 — configured 아님 → artifact/blocked'
      : contract_state === 'verified_recent_success'
        ? `configured + ledger live_completed · RPC ${SUPABASE_APPLY_SQL_RPC}`
        : `configured — contract:${contract_state} (ledger 검증 전)`;
  return {
    tool: 'supabase',
    declared,
    live_capable,
    configured,
    reason,
    missing,
    details: {
      url_present: !!url,
      url_valid: urlOk,
      service_role_present: !!key,
      rpc: SUPABASE_APPLY_SQL_RPC,
      contract_state,
    },
  };
}

export function supabaseInvocationPrecheck(action, payload, env) {
  const e = env || process.env;
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (action !== 'apply_sql') return { blocked: false, blocked_reason: null, next_required_input: null };
  const url = String(e.SUPABASE_URL || '').trim();
  const key = String(e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    return {
      blocked: true,
      blocked_reason: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      next_required_input: null,
    };
  }
  if (!String(pl.sql || pl.query || '').trim()) {
    return {
      blocked: true,
      blocked_reason: 'apply_sql requires payload.sql',
      next_required_input: 'sql',
    };
  }
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

export const supabaseToolAdapter = {
canExecuteLive(action, _payload, env) {
      if (action !== 'apply_sql') return false;
      const url = String(env.SUPABASE_URL || '').trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      return !!(url && key && isPlausibleSupabaseUrl(url));
    },
    async executeLive(action, payload, env) {
      const url = String(env.SUPABASE_URL || '').trim();
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      const sql = String(payload.sql || payload.query || '').trim();
      if (!sql) return { ok: false, result_summary: 'apply_sql requires payload.sql', error_code: 'missing_sql' };
      if (!isPlausibleSupabaseUrl(url)) {
        return { ok: false, result_summary: 'SUPABASE_URL invalid', error_code: 'bad_supabase_url' };
      }
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc(SUPABASE_APPLY_SQL_RPC, { sql_text: sql });
      if (error) {
        return {
          ok: false,
          result_summary: `Supabase RPC ${SUPABASE_APPLY_SQL_RPC}: ${error.message}`.slice(0, 220),
          error_code: 'supabase_rpc_error',
          data: { hint: 'DB에 cos_apply_sql(sql_text) 함수 설치 필요 — supabase/migrations 참고' },
        };
      }
      return {
        ok: true,
        result_summary: `live: ${SUPABASE_APPLY_SQL_RPC} ok`,
        data: data ?? {},
      };
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await cosToolArtifactSubdir('supabase');
      const fn = `sql_${invocation_id}.sql`;
      const fp = path.join(dir, fn);
      const sql = String(payload.sql || payload.query || '-- COS apply_sql payload\n');
      await fs.writeFile(fp, sql, 'utf8');
      return {
        ok: true,
        result_summary: `artifact: supabase/apply_sql → ${fp}`,
        artifact_path: fp,
      };
    },
};
