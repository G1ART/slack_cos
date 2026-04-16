/**
 * Cursor external tool lane (CLI create_spec, artifact emit_patch; test execFile hook).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { cosToolArtifactSubdir } from '../artifactSubdir.js';
import {
  isCursorCloudAgentLaneReady,
  isCursorCloudAgentEnabled,
  isCursorAutomationConfigured,
  automationEndpointHostOnly,
} from '../../cursorCloudAdapter.js';

const execFileAsync = promisify(execFile);

export const __cursorExecFileForTests = { fn: /** @type {typeof execFileAsync | null} */ (null) };

async function resolveCursorCliPath(env) {
  const explicit = String(env.CURSOR_CLI_BIN || '').trim();
  const candidates = explicit ? [explicit] : ['agent', 'cursor-agent'];
  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : c;
    if (path.isAbsolute(abs)) {
      try {
        await fs.access(abs, fsSync.constants.F_OK);
        return abs;
      } catch {
        continue;
      }
    }
    try {
      const { stdout } = await execFileAsync('/bin/sh', ['-lc', `command -v ${JSON.stringify(c)}`], {
        encoding: 'utf8',
        maxBuffer: 4096,
      });
      const p = String(stdout || '').trim().split('\n')[0];
      if (p) return p;
    } catch {
      /* PATH에 없음 */
    }
  }
  return null;
}

/**
 * @param {Record<string, string | undefined>} env
 */
function cursorProjectDir(env) {
  const d = String(env.CURSOR_PROJECT_DIR || '').trim();
  return d ? path.resolve(d) : process.cwd();
}

/**
 * @param {string} dir
 */
async function isDir(dir) {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}


export async function getCursorAdapterReadiness(env = process.env, _options = {}) {
  const e = env || process.env;
  const cliPath = await resolveCursorCliPath(e);
  const cwd = cursorProjectDir(e);
  const cwdOk = await isDir(cwd);
  const binDeclared = !!String(e.CURSOR_CLI_BIN || '').trim();
  const dirDeclared = !!String(e.CURSOR_PROJECT_DIR || '').trim();
  const epDeclared = !!String(e.CURSOR_AUTOMATION_ENDPOINT || '').trim();
  const authDeclared = !!String(e.CURSOR_AUTOMATION_AUTH_HEADER || '').trim();
  const automationLane = isCursorCloudAgentLaneReady(e);
  const enabledNoCreds = isCursorCloudAgentEnabled(e) && !isCursorAutomationConfigured(e);
  const declared =
    binDeclared || !!cliPath || dirDeclared || epDeclared || authDeclared || isCursorCloudAgentEnabled(e);
  const missing = [];
  if (!cliPath && !automationLane) missing.push('CURSOR_CLI_BIN 또는 PATH의 agent|cursor-agent');
  if (!cwdOk && !automationLane) missing.push('CURSOR_PROJECT_DIR(존재하는 디렉터리)');
  const configured = !!cliPath && cwdOk;
  const live_capable = configured || automationLane;
  const reason = automationLane
    ? 'CURSOR_CLOUD_AGENT_ENABLED=1 + Automation(endpoint+auth) → cloud_agent(create_spec|emit_patch); 웹훅 완료; CLI 폴백'
    : enabledNoCreds
      ? 'CURSOR_CLOUD_AGENT_ENABLED=1 이지만 CURSOR_AUTOMATION_* 없음 → CLI 또는 artifact'
      : live_capable
        ? 'configured: CLI+cwd OK → create_spec live; emit_patch는 cloud 없으면 artifact'
        : !declared
          ? 'declared: 없음 → artifact-only'
          : !cliPath
            ? 'declared: CLI 미해결 → artifact-only'
            : 'declared: cwd 없음/무효 → artifact-only';
  return {
    tool: 'cursor',
    declared,
    live_capable,
    configured,
    reason,
    missing,
    details: {
      cli_path: cliPath,
      cwd,
      cwd_ok: cwdOk,
      cloud_agent_lane_ready: automationLane,
      automation_endpoint_host: automationLane ? automationEndpointHostOnly(e.CURSOR_AUTOMATION_ENDPOINT) : null,
      execution_lane_preference: automationLane ? 'cloud_agent' : configured ? 'local_cli' : 'artifact',
      live_actions: automationLane ? ['create_spec', 'emit_patch'] : ['create_spec'],
      artifact_actions: automationLane ? [] : ['emit_patch'],
    },
  };
}

export function cursorInvocationPrecheck() {
  return { blocked: false, blocked_reason: null, next_required_input: null };
}

export const cursorToolAdapter = {
    /** @param {string} action */
    async canExecuteLive(action, _payload, env) {
      if (action !== 'create_spec') return false;
      const cliPath = await resolveCursorCliPath(env);
      const cwd = cursorProjectDir(env);
      return !!(cliPath && (await isDir(cwd)));
    },
    async executeLive(action, payload, env) {
      const cli = await resolveCursorCliPath(env);
      const cwd = cursorProjectDir(env);
      if (!cli) return { ok: false, result_summary: 'Cursor CLI not found', error_code: 'cursor_no_cli' };
      if (!(await isDir(cwd))) return { ok: false, result_summary: 'CURSOR_PROJECT_DIR invalid', error_code: 'cursor_bad_cwd' };

      const title = String(payload.title || payload.name || 'spec').slice(0, 300);
      const body = String(payload.body || payload.content || '').slice(0, 12000);
      const extra = Array.isArray(payload.cli_args)
        ? payload.cli_args.map((x) => String(x))
        : String(env.CURSOR_CREATE_SPEC_ARGS || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
      const baseArgs =
        extra.length > 0 ? extra : ['create_spec', title];
      const execImpl = __cursorExecFileForTests.fn || execFileAsync;
      try {
        const { stdout, stderr } = await execImpl(cli, baseArgs, {
          cwd,
          timeout: Number(env.CURSOR_CLI_TIMEOUT_MS || 120_000),
          maxBuffer: 2_000_000,
          env: { ...process.env, COS_CURSOR_SPEC_BODY: body },
        });
        const out = String(stdout || '').slice(0, 8000);
        const err = String(stderr || '').slice(0, 4000);
        return {
          ok: true,
          result_summary: `live: cursor create_spec exit 0 (${out.length}b stdout)`,
          data: { stdout: out, stderr: err, exit_code: 0, cli, cwd, argv: baseArgs },
        };
      } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? Number(e.code) : null;
        const stdout = e && typeof e === 'object' && 'stdout' in e ? String(e.stdout || '').slice(0, 4000) : '';
        const stderr = e && typeof e === 'object' && 'stderr' in e ? String(e.stderr || '').slice(0, 4000) : '';
        return {
          ok: false,
          result_summary: `cursor CLI failed: ${String(e?.message || e).slice(0, 160)}`,
          error_code: code != null && !Number.isNaN(code) ? `cursor_exit_${code}` : 'cursor_exec_error',
          data: { stdout, stderr, exit_code: code, cli, cwd, argv: baseArgs },
        };
      }
    },
    async buildArtifact(action, payload, invocation_id) {
      const dir = await cosToolArtifactSubdir('cursor');
      const ext = action === 'emit_patch' ? 'patch' : 'spec';
      const fn = `${ext}_${invocation_id}.md`;
      const fp = path.join(dir, fn);
      const title = String(payload.title || payload.name || action).slice(0, 200);
      const body = String(payload.body || payload.content || payload.markdown || `# ${title}\n\n(COS payload 스냅샷)\n\`\`\`json\n${JSON.stringify(payload, null, 0).slice(0, 12000)}\n\`\`\`\n`);
      await fs.writeFile(fp, body, 'utf8');
      return {
        ok: true,
        result_summary: `artifact: cursor/${action} → ${fp}`,
        artifact_path: fp,
      };
    },
};
