/**
 * vercel external tool lane.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { cosToolArtifactSubdir } from '../artifactSubdir.js';


export async function getVercelAdapterReadiness(_env = process.env, _options = {}) {
  return {
    tool: 'vercel',
    declared: false,
    live_capable: false,
    configured: false,
    reason: 'declared/configured/live 미구현 → 항상 artifact-only',
    missing: [],
    details: { deploy_live: false },
  };
}
export function vercelInvocationPrecheck() {
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

export const vercelToolAdapter = {
canExecuteLive() {
      return false;
    },
    async executeLive() {
      return { ok: false, result_summary: 'vercel artifact-only in this build', error_code: 'vercel_artifact_only' };
    },
    async buildArtifact(_action, payload, invocation_id) {
      const dir = await cosToolArtifactSubdir('vercel');
      const fn = `deploy_${invocation_id}.json`;
      const fp = path.join(dir, fn);
      await fs.writeFile(fp, JSON.stringify({ payload, invocation_id }, null, 2), 'utf8');
      return {
        ok: true,
        result_summary: `artifact: vercel/deploy → ${fp}`,
        artifact_path: fp,
      };
    },
};
