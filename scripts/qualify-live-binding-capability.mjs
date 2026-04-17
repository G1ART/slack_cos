#!/usr/bin/env node
/**
 * W12-A CLI — qualify:live-binding-capability.
 *
 * sink 별 capability 를 실증(qualify) 해서 ops/live_binding_capability_qualifications.json 원장에 upsert.
 *
 * 옵션:
 *   --sink <name>            (필수 또는 --all)
 *   --all                    알려진 모든 sink 대상
 *   --mode fixture|live      (기본 fixture)
 *   --verified-by <id>       검증 수행자 (예: 운영자 slack ID)
 *   --notes <s>              추가 설명 (토큰/URL 자동 redaction)
 *   --evidence-ref <s>       원장 외부 근거 포인터 (예: Notion/PR URL — redaction 통과)
 *   --ledger <path>          원장 경로 override (기본 ops/live_binding_capability_qualifications.json)
 *   --json                   JSON 출력
 *
 * fixture 모드: adapter 파일의 capability 메타를 비파괴 echo → qualification_status='fixture_verified'.
 * live 모드: sink 별 read-only probe 시도(env 토큰 주입 시에만). 자격 부족 시 status='skipped' exit 0.
 *
 * raw secret 값·토큰·URL 은 원장/로그 어디에도 들어가지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_QUALIFICATION_LEDGER_PATH,
  getCapabilityForSink,
  listKnownSinks,
  QUALIFICATION_STATUSES,
} from '../src/founder/liveBindingCapabilityRegistry.js';

function takeArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function redactSecretLike(raw) {
  let s = raw == null ? '' : String(raw);
  s = s.replace(/https?:\/\/\S+/g, '[url]');
  s = s.replace(/eyJ[a-zA-Z0-9_\-.]{10,}/g, '[jwt]');
  s = s.replace(/(?:Bearer\s+)?sk-[A-Za-z0-9\-_]{10,}/gi, '[token]');
  s = s.replace(/ghp_[A-Za-z0-9]{20,}/g, '[token]');
  s = s.replace(/gho_[A-Za-z0-9]{20,}/g, '[token]');
  s = s.replace(/ghu_[A-Za-z0-9]{20,}/g, '[token]');
  s = s.replace(/[A-Za-z0-9+/=]{40,}/g, (m) => (m.length >= 40 ? '[b64]' : m));
  return s;
}

function readLedger(ledgerPath) {
  try {
    const abs = path.isAbsolute(ledgerPath) ? ledgerPath : path.resolve(process.cwd(), ledgerPath);
    if (!fs.existsSync(abs)) return { schema_version: 1, sinks: {}, updated_at: null };
    const raw = fs.readFileSync(abs, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { schema_version: 1, sinks: {}, updated_at: null };
    if (!parsed.sinks || typeof parsed.sinks !== 'object') parsed.sinks = {};
    if (!parsed.schema_version) parsed.schema_version = 1;
    return parsed;
  } catch (_e) {
    return { schema_version: 1, sinks: {}, updated_at: null };
  }
}

function writeLedger(ledgerPath, ledger) {
  const abs = path.isAbsolute(ledgerPath) ? ledgerPath : path.resolve(process.cwd(), ledgerPath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  ledger.updated_at = new Date().toISOString();
  fs.writeFileSync(abs, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

function emitSinkAbsenceReason(sink) {
  const baseCap = getCapabilityForSink(sink);
  if (!baseCap.can_write) return 'registry_can_write_false';
  return null;
}

export async function probeLive(sink, { fetchImpl } = {}) {
  const fx = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const tokenEnvMap = {
    github: ['GITHUB_TOKEN', 'GH_TOKEN'],
    vercel: ['VERCEL_TOKEN'],
    railway: ['RAILWAY_TOKEN', 'RAILWAY_API_TOKEN'],
    supabase: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_MANAGEMENT_TOKEN'],
  };
  const envs = tokenEnvMap[sink] || [];
  const tokenEnvName = envs.find(
    (n) => typeof process.env[n] === 'string' && process.env[n].length > 0,
  );
  if (!tokenEnvName) {
    return { outcome: 'skipped', reason: 'no_credentials' };
  }
  const token = String(process.env[tokenEnvName] || '').trim();
  if (!fx) {
    return { outcome: 'skipped', reason: 'no_fetch_impl' };
  }

  if (sink === 'railway') {
    return {
      outcome: 'verification_failed',
      reason: 'no_write_support_in_this_epic',
    };
  }

  if (sink === 'github') {
    const repoFull =
      String(process.env.GITHUB_DEFAULT_OWNER || '').trim() &&
      String(process.env.GITHUB_DEFAULT_REPO || '').trim()
        ? `${process.env.GITHUB_DEFAULT_OWNER}/${process.env.GITHUB_DEFAULT_REPO}`
        : String(process.env.GITHUB_DEFAULT_BINDING_REPO || '').trim();
    if (!repoFull || !repoFull.includes('/')) {
      return { outcome: 'skipped', reason: 'github_default_repo_missing' };
    }
    try {
      const res = await fx(
        `https://api.github.com/repos/${repoFull}/actions/secrets/public-key`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (res.status >= 200 && res.status < 300) {
        return { outcome: 'live_verified', reason: `github_public_key_probe_ok_${res.status}` };
      }
      return { outcome: 'verification_failed', reason: `github_public_key_probe_status_${res.status}` };
    } catch (_e) {
      return { outcome: 'verification_failed', reason: 'github_public_key_probe_network_error' };
    }
  }

  if (sink === 'vercel') {
    const projectId = String(process.env.VERCEL_DEFAULT_PROJECT_ID || '').trim();
    if (!projectId) {
      return { outcome: 'skipped', reason: 'vercel_default_project_id_missing' };
    }
    try {
      const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`);
      url.searchParams.set('limit', '1');
      const teamId = String(process.env.VERCEL_TEAM_ID || '').trim();
      if (teamId) url.searchParams.set('teamId', teamId);
      const res = await fx(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.status >= 200 && res.status < 300) {
        return { outcome: 'live_verified', reason: `vercel_env_probe_ok_${res.status}` };
      }
      return { outcome: 'verification_failed', reason: `vercel_env_probe_status_${res.status}` };
    } catch (_e) {
      return { outcome: 'verification_failed', reason: 'vercel_env_probe_network_error' };
    }
  }

  if (sink === 'supabase') {
    try {
      const res = await fx('https://api.supabase.com/v1/projects', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.status >= 200 && res.status < 300) {
        return {
          outcome: 'live_verified_read_only',
          reason: `supabase_projects_probe_ok_${res.status}`,
        };
      }
      return {
        outcome: 'verification_failed',
        reason: `supabase_projects_probe_status_${res.status}`,
      };
    } catch (_e) {
      return { outcome: 'verification_failed', reason: 'supabase_projects_probe_network_error' };
    }
  }

  const absenceReason = emitSinkAbsenceReason(sink);
  if (absenceReason) {
    return { outcome: 'verification_failed', reason: absenceReason };
  }
  return { outcome: 'verification_failed', reason: 'unknown_sink_probe' };
}

async function qualifyOne(sink, { mode, verifiedBy, notes, evidenceRef }) {
  const normalized = String(sink || '').trim().toLowerCase();
  if (!normalized) throw new Error('sink required');
  const baseCap = getCapabilityForSink(normalized);
  const nowIso = new Date().toISOString();

  if (mode === 'fixture') {
    return {
      sink: normalized,
      qualification_status: 'fixture_verified',
      last_verified_at: nowIso,
      last_verified_mode: 'fixture',
      verified_by: verifiedBy || null,
      verification_notes: redactSecretLike(
        notes ||
          `fixture_verified from static adapter metadata: can_write=${baseCap.can_write}, modes=${baseCap.verification_modes_supported.join('|')}`,
      ),
      evidence_ref: evidenceRef ? redactSecretLike(evidenceRef) : null,
    };
  }

  if (mode === 'live') {
    const probe = await probeLive(normalized);
    if (probe.outcome === 'skipped') {
      return { sink: normalized, skipped: true, reason: probe.reason };
    }
    return {
      sink: normalized,
      qualification_status: probe.outcome,
      last_verified_at: nowIso,
      last_verified_mode: 'live',
      verified_by: verifiedBy || null,
      verification_notes: redactSecretLike(notes || probe.reason),
      evidence_ref: evidenceRef ? redactSecretLike(evidenceRef) : null,
    };
  }

  throw new Error(`unknown mode: ${mode}`);
}

async function main() {
  const sink = takeArg('--sink');
  const all = process.argv.includes('--all');
  const mode = (takeArg('--mode') || 'fixture').toLowerCase();
  const verifiedBy = takeArg('--verified-by');
  const notes = takeArg('--notes');
  const evidenceRef = takeArg('--evidence-ref');
  const ledgerPath = takeArg('--ledger') || DEFAULT_QUALIFICATION_LEDGER_PATH;
  const jsonOut = process.argv.includes('--json');

  if (!sink && !all) {
    console.error('qualify-live-binding-capability: --sink <name> 또는 --all 필요');
    process.exit(2);
  }
  if (mode !== 'fixture' && mode !== 'live') {
    console.error(`qualify-live-binding-capability: --mode fixture|live (got ${mode})`);
    process.exit(2);
  }

  const targets = all ? listKnownSinks() : [sink];
  const ledger = readLedger(ledgerPath);
  const results = [];

  for (const t of targets) {
    try {
      const res = await qualifyOne(t, { mode, verifiedBy, notes, evidenceRef });
      results.push(res);
      if (!res.skipped) {
        ledger.sinks[res.sink] = {
          qualification_status: res.qualification_status,
          last_verified_at: res.last_verified_at,
          last_verified_mode: res.last_verified_mode,
          verified_by: res.verified_by,
          verification_notes: res.verification_notes,
          evidence_ref: res.evidence_ref,
        };
      }
    } catch (err) {
      results.push({ sink: t, error: String(err && err.message ? err.message : err) });
    }
  }

  writeLedger(ledgerPath, ledger);

  const summary = {
    schema_version: 1,
    status: 'ok',
    mode,
    ledger_path: ledgerPath,
    updated_at: ledger.updated_at,
    results,
    known_statuses: QUALIFICATION_STATUSES,
  };

  if (jsonOut) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`qualify-live-binding-capability: mode=${mode} ledger=${ledgerPath}`);
    for (const r of results) {
      if (r.skipped) {
        console.log(`  ${r.sink}: skipped (${r.reason})`);
      } else if (r.error) {
        console.log(`  ${r.sink}: error (${r.error})`);
      } else {
        console.log(
          `  ${r.sink}: ${r.qualification_status} · mode=${r.last_verified_mode} · by=${r.verified_by || '-'}`,
        );
      }
    }
  }
}

import { fileURLToPath } from 'node:url';

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  main().catch((err) => {
    console.error('qualify-live-binding-capability: fatal', err && err.message ? err.message : err);
    process.exit(1);
  });
}
