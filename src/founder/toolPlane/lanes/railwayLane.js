/**
 * railway external tool lane.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { cosToolArtifactSubdir } from '../artifactSubdir.js';


export async function getRailwayAdapterReadiness(env = process.env, _options = {}) {
  const e = env || process.env;
  const token = String(e.RAILWAY_TOKEN || '').trim();
  const dep = String(e.RAILWAY_DEPLOYMENT_ID || '').trim();
  const missing = [];
  if (!token) missing.push('RAILWAY_TOKEN');
  if (!dep) missing.push('RAILWAY_DEPLOYMENT_ID 또는 payload.deployment_id');
  const declared = !!(token || dep);
  const configured = !!token;
  const inspectLiveCapable = !!token && !!dep;
  const live_capable = inspectLiveCapable;
  const reason = !declared
    ? 'declared: 토큰·기본 deployment_id 없음 → inspect_logs blocked/artifact'
    : !configured
      ? 'configured: 토큰 없음 (deployment_id만 선언) → artifact'
      : inspectLiveCapable
        ? 'configured: 토큰+deployment_id → inspect_logs live 가능; deploy: 비활성'
        : 'configured: 토큰 있음 — deployment_id 필요 → inspect_logs live 불가';
  return {
    tool: 'railway',
    declared,
    live_capable,
    configured,
    reason,
    missing: token ? (dep ? [] : ['deployment_id']) : ['RAILWAY_TOKEN'],
    details: {
      has_token: !!token,
      default_deployment_id: dep || null,
      inspect_logs_live_capable: inspectLiveCapable,
      deploy_live: false,
      deploy_blocked_reason: '이 빌드에서 railway deploy live 미개방',
    },
  };
}
export function railwayInvocationPrecheck(action, payload, env) {
  const e = env || process.env;
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (action === 'inspect_logs') {
    if (!String(e.RAILWAY_TOKEN || '').trim()) {
      return { blocked: true, blocked_reason: 'missing RAILWAY_TOKEN', next_required_input: null };
    }
    const dep = String(pl.deployment_id || e.RAILWAY_DEPLOYMENT_ID || '').trim();
    if (!dep) {
      return {
        blocked: true,
        blocked_reason: 'inspect_logs requires deployment_id in payload or RAILWAY_DEPLOYMENT_ID',
        next_required_input: 'deployment_id',
      };
    }
  }
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

export const railwayToolAdapter = {
canExecuteLive(action, payload, env) {
      if (!String(env.RAILWAY_TOKEN || '').trim()) return false;
      if (action === 'deploy') return false;
      if (action === 'inspect_logs') {
        const dep = String(payload.deployment_id || env.RAILWAY_DEPLOYMENT_ID || '').trim();
        return !!dep;
      }
      return false;
    },
    async executeLive(action, payload, env) {
      const token = String(env.RAILWAY_TOKEN || '').trim();
      const deploymentId = String(payload.deployment_id || env.RAILWAY_DEPLOYMENT_ID || '').trim();
      if (action !== 'inspect_logs' || !deploymentId) {
        return { ok: false, result_summary: 'inspect_logs needs deployment_id', error_code: 'railway_no_deployment' };
      }
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `query { deploymentLogs(deploymentId: "${deploymentId}") { ... on DeploymentLog { message } } }`,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, result_summary: `railway graphql ${res.status}`, error_code: `railway_${res.status}` };
      }
      return {
        ok: true,
        result_summary: `live: railway logs fetched (${text.length}b)`,
        data: { raw: text.slice(0, 4000) },
      };
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await cosToolArtifactSubdir('railway');
      const fn = `${action}_${invocation_id}.json`;
      const fp = path.join(dir, fn);
      await fs.writeFile(fp, JSON.stringify({ action, payload, invocation_id }, null, 2), 'utf8');
      let hint = '';
      if (action === 'inspect_logs') {
        hint = ' (set deployment_id + RAILWAY_TOKEN for live)';
      }
      return {
        ok: true,
        result_summary: `artifact: railway/${action} → ${fp}${hint}`,
        artifact_path: fp,
        next_required_input: action === 'inspect_logs' ? 'deployment_id' : null,
      };
    },
};
