#!/usr/bin/env node
/**
 * “기대 퍼포먼스 계약” 회귀 묶음 — 택배사무소(A–C) + 콜백·집계·strict recovery 가드.
 * Slack·OpenAI·실 Supabase 불필요.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const STEPS = [
  'verify-parcel-post-office.mjs',
  'test-v13-57-recovery-callback-vs-github.mjs',
  'test-v13-73-authoritative-callback-closure.mjs',
  'test-v13-77-receive-intake-commit.mjs',
  'test-v13-83-post-callback-ops-phases-in-aggregate.mjs',
  'test-v13-84-strict-live-skips-github-recovery-envelope-guard.mjs',
  'test-github-remains-secondary-evidence-only.mjs',
];

for (const name of STEPS) {
  const script = path.join(__dirname, name);
  const r = spawnSync(node, [script], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[verify-performance-contract] FAILED: ${name} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

console.log(`\n[verify-performance-contract] ok: ${STEPS.length} steps`);
