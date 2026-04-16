/**
 * Adapter readiness aggregation for COS system input (uses lane registry).
 */

import { getExternalLaneRuntime } from './externalToolLaneRegistry.js';

/**
 * @param {string} tool
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ threadKey?: string }} [options]
 */
export async function getAdapterReadiness(tool, env = process.env, options = {}) {
  const lane = getExternalLaneRuntime(tool);
  if (!lane) {
    return {
      tool: String(tool),
      declared: false,
      live_capable: false,
      configured: false,
      reason: 'unknown tool',
      missing: [],
      details: {},
    };
  }
  return lane.getAdapterReadiness(env, options);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ threadKey?: string }} [options]
 */
export async function getAllAdapterReadiness(env = process.env, options = {}) {
  const tools = ['github', 'supabase', 'cursor', 'railway', 'vercel'];
  const out = [];
  for (const t of tools) {
    out.push(await getAdapterReadiness(t, env, options));
  }
  return out;
}

/**
 * COS 시스템 입력용 1줄 요약 (최대 6줄 권장).
 * @param {{ tool: string, live_capable: boolean, reason: string, details?: Record<string, unknown> }} r
 */
export function formatAdapterReadinessOneLine(r) {
  if (r.tool === 'github') {
    const d = r.details;
    const ts = d.github_token_source;
    const rs = d.github_repository_source;
    const tag =
      ts && rs && (ts !== 'GITHUB_TOKEN' || rs !== 'GITHUB_REPOSITORY')
        ? ` [${ts}+${rs}]`
        : '';
    return `github: ${r.live_capable ? 'live-ready' : 'artifact'}${tag} — ${r.reason}`;
  }
  if (r.tool === 'supabase') {
    const cs = r.details?.contract_state ? String(r.details.contract_state) : '';
    const csPart = cs ? ` [${cs}]` : '';
    return `supabase: ${r.live_capable ? 'live-ready(apply_sql→rpc)' : 'artifact'}${csPart} — ${r.reason}`;
  }
  if (r.tool === 'cursor') {
    return `cursor: ${r.live_capable ? 'create_spec live-ready' : 'artifact-only'} — ${r.reason}`;
  }
  if (r.tool === 'railway') {
    const d = r.details;
    const ins = d.inspect_logs_live_capable ? 'inspect_logs-ready' : 'inspect_logs-needs-deployment_id';
    return `railway: ${ins} / deploy-disabled — ${r.reason}`;
  }
  if (r.tool === 'vercel') {
    return `vercel: artifact-only — ${r.reason}`;
  }
  return `${r.tool}: ${r.live_capable ? 'live' : 'artifact'} — ${r.reason}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {number} [max]
 * @param {string} [threadKey]
 */
export async function formatAdapterReadinessCompactLines(env = process.env, max = 6, threadKey = '') {
  const all = await getAllAdapterReadiness(env, { threadKey });
  return all.map(formatAdapterReadinessOneLine).slice(0, max);
}
