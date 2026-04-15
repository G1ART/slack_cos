#!/usr/bin/env node
/**
 * 택배사무소(Parcel Post Office) A–C 회귀 묶음 — Slack·OpenAI·실 Supabase 없이 동작.
 * 전체 스위트보다 짧게 “게이트·뷰·wake·샤딩”만 재확인할 때 사용.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const STEPS = [
  'test-ops-smoke-parcel-gate-invariants.mjs',
  'test-ops-smoke-parcel-gate-summary-invariant.mjs',
  'test-parcel-phase-partition-display.mjs',
  'test-smoke-session-id-prefix.mjs',
  'test-filter-ops-smoke-summaries-session-prefix.mjs',
  'test-parcel-closure-ledger-mirror.mjs',
  'test-run-supervisor-parcel-sharding.mjs',
  'test-smoke-summary-stream-view-sql-ssot.mjs',
  'test-merged-smoke-summary-source-budget.mjs',
  'test-supabase-smoke-summary-stream-view-path.mjs',
  'test-parcel-deployment-key-filter.mjs',
  'test-merge-ledger-execution-row-payload.mjs',
  'test-persona-contract-outline.mjs',
  'test-persona-contract-manifest.mjs',
  'test-audit-parcel-health-skips-without-supabase.mjs',
  'test-audit-parcel-ops-smoke-ledger-tenancy-report-shape.mjs',
  'test-external-event-wakes-supervisor.mjs',
  'test-cursor-callback-wakes-correlated-run-supervisor.mjs',
  'test-github-external-event-targets-correlated-run-not-latest.mjs',
  'test-process-restart-does-not-lose-run-scoped-wake.mjs',
];

for (const name of STEPS) {
  const script = path.join(__dirname, name);
  const r = spawnSync(node, [script], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[verify-parcel-post-office] FAILED: ${name} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

console.log(`\n[verify-parcel-post-office] ok — ${STEPS.length} steps`);
