#!/usr/bin/env node
/**
 * W10-B CLI — audit-harness-proof.
 *
 * Harness 실제 품질 기여를 수치로 본다: reviewer_findings · unresolved_disagreements ·
 * rework_cause · acceptance_evidence · correction_hit_rate · patch_quality_delta 의 aggregate scorecard.
 *
 * 입력 소스 우선순위:
 *   1) --fixture <path> — JSON 배열(Array<HarnessProofSession>) 또는 {sessions:[...]}
 *   2) Supabase 자격이 있으면 cos_runs 최근 N 행을 읽고 harness_workcell_runtime 을 추출
 *   3) 자격 없으면 `audit:parcel-health` 와 동일 스타일의 skipped 종료(exit 0)
 *
 * 출력: --json 시 JSON, 아니면 scorecard summary + 한국어 compact lines.
 * 새 Slack 송신 경로를 만들지 않는다 (audit 전용 CLI).
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  buildHarnessProofScorecard,
  toHarnessProofCompactLines,
} from '../src/founder/harnessProofScorecard.js';

function takeArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

const fixturePath = takeArg('--fixture');
const jsonOnly = process.argv.includes('--json');
const limit = Number(takeArg('--limit') || 50);

async function loadSessionsFromFixture(p) {
  const abs = path.resolve(p);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.sessions)) return parsed.sessions;
  throw new Error('fixture must be an array or { sessions: [...] }');
}

async function loadSessionsFromSupabase(max) {
  let createSb = null;
  try {
    ({ createCosRuntimeSupabaseForSummary: createSb } = await import('../src/founder/runStoreSupabase.js'));
  } catch {
    return null;
  }
  const sb = typeof createSb === 'function' ? createSb() : null;
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('cos_runs')
      .select('id, harness_workcell_runtime, updated_at')
      .not('harness_workcell_runtime', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(Math.max(1, Math.min(500, Number.isFinite(max) ? max : 50)));
    if (error) return null;
    const out = [];
    for (const row of data || []) {
      const wc = row && typeof row.harness_workcell_runtime === 'object' ? row.harness_workcell_runtime : null;
      if (!wc) continue;
      out.push({
        reviewer_findings_count: wc.reviewer_findings_count ?? null,
        rework_cause_code: wc.rework_cause_code ?? null,
        acceptance_evidence_kind: wc.acceptance_evidence_kind ?? null,
        unresolved_disagreements: wc.unresolved_disagreements ?? null,
        correction_hit_rate: wc.correction_hit_rate ?? null,
        patch_quality_delta: wc.patch_quality_delta ?? null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

async function main() {
  let sessions = null;
  let source = 'none';
  if (fixturePath) {
    sessions = await loadSessionsFromFixture(fixturePath);
    source = 'fixture';
  } else {
    sessions = await loadSessionsFromSupabase(limit);
    source = sessions ? 'supabase' : 'none';
  }

  if (!sessions) {
    const skipped = {
      status: 'skipped',
      reason: 'supabase credentials unavailable and no --fixture provided',
      compact_lines: [],
    };
    if (jsonOnly) process.stdout.write(`${JSON.stringify(skipped, null, 2)}\n`);
    else process.stdout.write('audit-harness-proof: skipped (Supabase 자격 없음, --fixture 미지정)\n');
    return;
  }

  const scorecard = buildHarnessProofScorecard(sessions);
  const compact_lines = toHarnessProofCompactLines(scorecard);

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify({ source, scorecard, compact_lines }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`source=${source} · sessions=${scorecard.session_count}\n`);
  for (const line of compact_lines) process.stdout.write(`  · ${line}\n`);
}

main().catch((err) => {
  process.stderr.write(`audit-harness-proof crashed: ${err && err.message ? err.message : err}\n`);
  process.exit(3);
});
