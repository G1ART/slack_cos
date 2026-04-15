#!/usr/bin/env node
/**
 * 페이즈 D 전제 §4 자동화: Supabase에서 요약 스트림·슈퍼바이저 백로그·고아 테이블 샘플 지표를 뽑는다.
 * GPT/Cursor가 동일 출력을 읽고 WARN/FAIL을 해석하면 된다 (사람이 표를 직접 보지 않아도 됨).
 *
 * 자격 없으면 exit 0 + skipped (CI·로컬 무자격 환경).
 *
 * 사용:
 *   node scripts/audit-parcel-ops-smoke-health.mjs
 *   node scripts/audit-parcel-ops-smoke-health.mjs --sample 5000 --strict
 *   node scripts/audit-parcel-ops-smoke-health.mjs --strict --strict-warnings-only
 *   node scripts/audit-parcel-ops-smoke-health.mjs --json
 *   node scripts/audit-parcel-ops-smoke-health.mjs --parcel-deployment-key prod_a --parcel-deployment-include-legacy
 *   node scripts/audit-parcel-ops-smoke-health.mjs --workspace-key T0123 --tenancy-include-legacy
 *   (JSON) ledger_tenancy_product_top / ledger_tenancy_project_space_top — cos_run_events_tenancy_stream 샘플 분포
 *
 * 임계(선택): COS_PARCEL_HEALTH_ORPHAN_FRACTION_WARN, COS_PARCEL_HEALTH_PENDING_WAKE_WARN,
 *   COS_PARCEL_HEALTH_OPS_NULL_RUN_WARN
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  createCosRuntimeSupabaseForSummary,
  COS_OPS_SMOKE_SUMMARY_STREAM_VIEW,
  COS_RUN_EVENTS_TENANCY_STREAM_VIEW,
} from '../src/founder/runStoreSupabase.js';
import {
  filterRowsByOptionalTenancyKeys,
  parcelDeploymentKeyFromEnv,
} from '../src/founder/parcelDeploymentContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} v */
function classifyStreamRunId(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'empty';
  if (s === '_orphan') return 'orphan_label';
  if (UUID_RE.test(s)) return 'uuid';
  return 'other';
}

function parseArgs() {
  const a = process.argv.slice(2);
  let sample = 3000;
  let strict = false;
  let strictWarningsOnly = false;
  let jsonOnly = false;
  /** @type {string | null} */
  let parcelDeploymentKey = null;
  let parcelDeploymentIncludeLegacy = false;
  /** @type {string | null} */
  let workspaceKey = null;
  /** @type {string | null} */
  let productKey = null;
  /** @type {string | null} */
  let projectSpaceKey = null;
  let tenancyIncludeLegacy = false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--sample' && a[i + 1]) {
      sample = Math.max(100, Math.min(20000, parseInt(a[i + 1], 10) || 3000));
      i += 1;
    } else if (a[i] === '--strict') strict = true;
    else if (a[i] === '--strict-warnings-only') strictWarningsOnly = true;
    else if (a[i] === '--json') jsonOnly = true;
    else if (a[i] === '--parcel-deployment-key' && a[i + 1]) {
      parcelDeploymentKey = String(a[++i] || '').trim() || null;
    } else if (a[i] === '--parcel-deployment-include-legacy') parcelDeploymentIncludeLegacy = true;
    else if (a[i] === '--workspace-key' && a[i + 1]) {
      workspaceKey = String(a[++i] || '').trim() || null;
    } else if (a[i] === '--product-key' && a[i + 1]) {
      productKey = String(a[++i] || '').trim() || null;
    } else if (a[i] === '--project-space-key' && a[i + 1]) {
      projectSpaceKey = String(a[++i] || '').trim() || null;
    } else if (a[i] === '--tenancy-include-legacy') tenancyIncludeLegacy = true;
  }
  return {
    sample,
    strict,
    strictWarningsOnly,
    jsonOnly,
    parcelDeploymentIncludeLegacy,
    parcelDeploymentKey,
    workspaceKey,
    productKey,
    projectSpaceKey,
    tenancyIncludeLegacy,
  };
}

/** @param {string} name @param {number} def */
function envNum(name, def) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const ORPHAN_FRACTION_WARN = envNum('COS_PARCEL_HEALTH_ORPHAN_FRACTION_WARN', 0.35);
const PENDING_WAKE_WARN = envNum('COS_PARCEL_HEALTH_PENDING_WAKE_WARN', 50);
const OPS_NULL_RUN_WARN = envNum('COS_PARCEL_HEALTH_OPS_NULL_RUN_WARN', 500);

async function main() {
  const {
    sample,
    strict,
    strictWarningsOnly,
    jsonOnly,
    parcelDeploymentIncludeLegacy,
    parcelDeploymentKey,
    workspaceKey,
    productKey,
    projectSpaceKey,
    tenancyIncludeLegacy,
  } = parseArgs();
  const deployScopeKey =
    parcelDeploymentKey != null && String(parcelDeploymentKey).trim() !== ''
      ? String(parcelDeploymentKey).trim()
      : parcelDeploymentKeyFromEnv();
  const sb = createCosRuntimeSupabaseForSummary(process.env);
  if (!sb) {
    const out = {
      ok: true,
      skipped: true,
      reason: 'no_supabase_client',
      hint: 'Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or COS_RUNTIME_*) for live audit.',
      warnings: [],
    };
    if (jsonOnly) console.log(JSON.stringify(out));
    else console.log('[parcel-health] SKIP: Supabase 자격 없음 —', out.hint);
    process.exit(0);
    return;
  }

  const view = COS_OPS_SMOKE_SUMMARY_STREAM_VIEW;
  /** 슈퍼바이저·고아 테이블·집계 실패 등 — ok=false 원인 */
  const warnings = [];
  /** D1 이중기록 구간에서 흔한 스트림 고아 비율 — 런타임 ‘고장’과 구분 */
  const advisory = [];

  const { count: streamTotal, error: eCount } = await sb
    .from(view)
    .select('*', { count: 'exact', head: true });
  if (eCount) {
    const err = { ok: false, skipped: false, error: eCount.message, view };
    if (jsonOnly) console.log(JSON.stringify(err));
    else console.error('[parcel-health] stream count 실패:', eCount.message);
    process.exit(2);
    return;
  }

  let sampleQ = sb
    .from(view)
    .select(
      'run_id,event_type,created_at,payload,parcel_deployment_key,workspace_key,product_key,project_space_key,slack_team_id',
    )
    .order('created_at', { ascending: false });
  if (deployScopeKey) {
    if (parcelDeploymentIncludeLegacy) {
      sampleQ = sampleQ.or(
        `parcel_deployment_key.eq.${deployScopeKey},parcel_deployment_key.is.null`,
      );
    } else {
      sampleQ = sampleQ.eq('parcel_deployment_key', deployScopeKey);
    }
  }
  const { data: rows, error: eSample } = await sampleQ.limit(sample);

  if (eSample) {
    const err = { ok: false, skipped: false, error: eSample.message, view };
    if (jsonOnly) console.log(JSON.stringify(err));
    else console.error('[parcel-health] stream sample 실패:', eSample.message);
    process.exit(2);
    return;
  }

  let list = Array.isArray(rows) ? rows : [];
  list = filterRowsByOptionalTenancyKeys(list, {
    workspaceKey,
    productKey,
    projectSpaceKey,
    tenancyIncludeLegacy,
  });
  let orphanish = 0;
  /** @type {Record<string, number>} */
  const byClass = {};
  /** @type {Record<string, number>} */
  const orphanEventTypes = {};
  /** @type {Record<string, number>} */
  const uuidEventTypes = {};

  for (const r of list) {
    const c = classifyStreamRunId(r.run_id);
    byClass[c] = (byClass[c] || 0) + 1;
    const et = String(r.event_type || '').trim() || '(empty)';
    if (c === 'orphan_label' || c === 'empty' || c === 'other') {
      orphanish += 1;
      orphanEventTypes[et] = (orphanEventTypes[et] || 0) + 1;
    } else {
      uuidEventTypes[et] = (uuidEventTypes[et] || 0) + 1;
    }
  }

  /** @type {Record<string, number>} */
  const smokeSlackTeamHist = {};
  for (const r of list) {
    const pl = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {};
    const fromCol = r.slack_team_id != null && String(r.slack_team_id).trim() ? String(r.slack_team_id).trim() : '';
    const fromPl = pl.slack_team_id != null && String(pl.slack_team_id).trim() ? String(pl.slack_team_id).trim() : '';
    const sid = fromCol || fromPl || '(none)';
    smokeSlackTeamHist[sid] = (smokeSlackTeamHist[sid] || 0) + 1;
  }
  const smoke_slack_team_top = Object.entries(smokeSlackTeamHist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => ({ slack_team_id: k, count: v }));

  const orphanFraction = list.length ? orphanish / list.length : 0;
  if (orphanFraction > ORPHAN_FRACTION_WARN) {
    advisory.push(
      `stream_sample_orphanish_fraction=${orphanFraction.toFixed(3)} > ${ORPHAN_FRACTION_WARN} (D1/cos_ops_smoke_events 고아 줄기가 스트림에 섞인 비중 — 축소 전 추이만 보면 됨)`,
    );
  }

  const { count: pendingWake, error: eWake } = await sb
    .from('cos_runs')
    .select('id', { count: 'exact', head: true })
    .eq('pending_supervisor_wake', true);

  if (eWake) {
    warnings.push(`cos_runs pending_supervisor_wake count 실패: ${eWake.message}`);
  } else if ((pendingWake ?? 0) > PENDING_WAKE_WARN) {
    warnings.push(
      `pending_supervisor_wake_count=${pendingWake} > ${PENDING_WAKE_WARN} (슈퍼바이저가 밀렸을 수 있음 — Railway 프로세스·로그 확인)`,
    );
  }

  let opsNullRunCount = null;
  const { count: nullRun, error: eOps } = await sb
    .from('cos_ops_smoke_events')
    .select('id', { count: 'exact', head: true })
    .is('run_id', null);

  if (eOps) {
    warnings.push(`cos_ops_smoke_events run_id IS NULL count 실패: ${eOps.message}`);
  } else {
    opsNullRunCount = nullRun ?? 0;
    if (opsNullRunCount > OPS_NULL_RUN_WARN) {
      warnings.push(
        `cos_ops_smoke_events_null_run_id_count=${opsNullRunCount} > ${OPS_NULL_RUN_WARN} (고아 전용 테이블 누적이 큼)`,
      );
    }
  }

  /** 최근 ledger 이벤트 테넌시·Slack 팀·제품·프로젝트 스페이스 분포(M3 / M6 관측). 뷰 미적용 시 advisory 만. */
  let ledgerTenancySampleSize = 0;
  /** @type {Array<{ workspace_key: string, count: number }>} */
  let ledgerTenancyWorkspaceTop = [];
  /** @type {Array<{ slack_team_id: string, count: number }>} */
  let ledgerSlackTeamTop = [];
  /** @type {Array<{ product_key: string, count: number }>} */
  let ledgerTenancyProductTop = [];
  /** @type {Array<{ project_space_key: string, count: number }>} */
  let ledgerTenancyProjectSpaceTop = [];
  const ledgerLim = Math.max(50, Math.min(sample, 500));
  const { data: ledgerRows, error: eLedger } = await sb
    .from(COS_RUN_EVENTS_TENANCY_STREAM_VIEW)
    .select('workspace_key, slack_team_id, product_key, project_space_key')
    .order('created_at', { ascending: false })
    .limit(ledgerLim);
  if (eLedger) {
    advisory.push(
      `${COS_RUN_EVENTS_TENANCY_STREAM_VIEW}: ${eLedger.message} (DDL 미적용이면 무시; 마이그레이션 적용 후 재실행)`,
    );
  } else {
    const lr = Array.isArray(ledgerRows) ? ledgerRows : [];
    ledgerTenancySampleSize = lr.length;
    /** @type {Record<string, number>} */
    const wh = {};
    /** @type {Record<string, number>} */
    const sh = {};
    /** @type {Record<string, number>} */
    const pk = {};
    /** @type {Record<string, number>} */
    const psk = {};
    for (const row of lr) {
      const wk =
        row.workspace_key != null && String(row.workspace_key).trim()
          ? String(row.workspace_key).trim()
          : '(none)';
      wh[wk] = (wh[wk] || 0) + 1;
      const sid =
        row.slack_team_id != null && String(row.slack_team_id).trim()
          ? String(row.slack_team_id).trim()
          : '(none)';
      sh[sid] = (sh[sid] || 0) + 1;
      const prod =
        row.product_key != null && String(row.product_key).trim()
          ? String(row.product_key).trim()
          : '(none)';
      pk[prod] = (pk[prod] || 0) + 1;
      const pspace =
        row.project_space_key != null && String(row.project_space_key).trim()
          ? String(row.project_space_key).trim()
          : '(none)';
      psk[pspace] = (psk[pspace] || 0) + 1;
    }
    ledgerTenancyWorkspaceTop = Object.entries(wh)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => ({ workspace_key: k, count: v }));
    ledgerSlackTeamTop = Object.entries(sh)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => ({ slack_team_id: k, count: v }));
    ledgerTenancyProductTop = Object.entries(pk)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => ({ product_key: k, count: v }));
    ledgerTenancyProjectSpaceTop = Object.entries(psk)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => ({ project_space_key: k, count: v }));
  }

  const ok = warnings.length === 0;
  let interpretationKo =
    ok && advisory.length === 0
      ? '뷰·집계 정상. 하드 경고·권고 없음.'
      : ok && advisory.length > 0
        ? '뷰·집계·슈퍼바이저·고아 테이블 절대량은 양호로 보임. advisory는 D1 이중기록 구간에서 흔한 스트림 고아 비율 안내.'
        : '하드 경고가 있음 — Railway 로그·웹훅·DB를 우선 확인.';

  const strictFail =
    strict &&
    (warnings.length > 0 || (advisory.length > 0 && !strictWarningsOnly));

  const report = {
    ok,
    skipped: false,
    interpretation_ko: interpretationKo,
    view,
    parcel_deployment_scope: deployScopeKey || null,
    parcel_deployment_include_legacy: parcelDeploymentIncludeLegacy,
    workspace_scope: workspaceKey || null,
    product_scope: productKey || null,
    project_space_scope: projectSpaceKey || null,
    tenancy_include_legacy: tenancyIncludeLegacy,
    stream_row_count_estimate: streamTotal ?? null,
    sample_size: list.length,
    sample_requested: sample,
    run_id_class_counts: byClass,
    orphanish_row_count: orphanish,
    orphanish_fraction_in_sample: list.length ? Number(orphanFraction.toFixed(4)) : null,
    top_event_types_orphanish_sample: topKeys(orphanEventTypes, 8),
    top_event_types_uuid_sample: topKeys(uuidEventTypes, 8),
    smoke_slack_team_top,
    pending_supervisor_wake_count: eWake ? null : pendingWake ?? 0,
    cos_ops_smoke_events_null_run_id_count: opsNullRunCount,
    ledger_tenancy_stream_view: COS_RUN_EVENTS_TENANCY_STREAM_VIEW,
    ledger_tenancy_sample_size: ledgerTenancySampleSize,
    ledger_tenancy_workspace_top: ledgerTenancyWorkspaceTop,
    ledger_slack_team_top: ledgerSlackTeamTop,
    ledger_tenancy_product_top: ledgerTenancyProductTop,
    ledger_tenancy_project_space_top: ledgerTenancyProjectSpaceTop,
    thresholds: {
      orphan_fraction_warn: ORPHAN_FRACTION_WARN,
      pending_wake_warn: PENDING_WAKE_WARN,
      ops_null_run_warn: OPS_NULL_RUN_WARN,
    },
    warnings,
    advisory,
    /** --strict 일 때 exit 1 원인을 JSON만 봐도 구분 (ok:true 인데 npm 실패 혼란 방지) */
    strict_mode: strict,
    strict_warnings_only: strict ? strictWarningsOnly : false,
    strict_exit_nonzero: strictFail,
    strict_fail_due_to_warnings: strict && warnings.length > 0,
    strict_fail_due_to_advisory: strict && advisory.length > 0 && !strictWarningsOnly,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
    if (advisory.length) {
      console.log('\n--- ADVISORY (D1 구간에서 정상일 수 있음) ---\n' + advisory.join('\n'));
    }
    if (warnings.length) {
      console.log('\n--- WARN ---\n' + warnings.join('\n'));
    }
    if (interpretationKo) {
      console.log('\n--- 해석 ---\n' + interpretationKo);
    }
    if (strict && strictFail) {
      const bits = [];
      if (warnings.length) bits.push('warnings');
      if (advisory.length && !strictWarningsOnly) bits.push('advisory');
      const hint = strictWarningsOnly
        ? '(strict-warnings-only: advisory는 exit에 미포함)'
        : '(기본 strict: advisory 포함 시에도 exit 1 — CI는 --strict-warnings-only 권장 가능)';
      console.log(`\n--- strict 종료 ---\nexit 1: ${bits.join(' + ')} ${hint}`);
    }
  }

  process.exit(strictFail ? 1 : 0);
}

/** @param {Record<string, number>} m @param {number} n */
function topKeys(m, n) {
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ event_type: k, count: v }));
}

main().catch((e) => {
  console.error('[parcel-health]', e);
  process.exit(2);
});
