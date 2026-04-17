#!/usr/bin/env node
/**
 * W11-B CLI — audit:delivery-readiness.
 *
 * project_space_key 단위로 운영자용 readiness 보고서를 출력한다. 신규 Slack 송신 경로를 만들지 않는다.
 *
 * 입력 소스 우선순위:
 *   1) --fixture <path> — JSON { spaces: [{ project_space_key, binding_graph?, open_human_gates?, recent_propagation_runs?, tool_qualifications? }, ...] }
 *   2) --project-space-key <key>  (+ optional --all-recent 또는 --limit N — 자격 있을 때만)
 *   3) Supabase 자격 있으면 cos_runs 최근 distinct project_space_key (--all-recent)
 *   4) 자격 없으면 status:'skipped' exit 0
 *
 * 출력: --json 시 JSON, 아니면 헤더 + compact lines 5 블록.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  buildDeliveryReadiness,
  loadDeliveryReadiness,
} from '../src/founder/deliveryReadiness.js';
import { buildBindingGraph } from '../src/founder/projectSpaceBindingGraph.js';
import {
  formatBindingGraphCompactLines,
} from '../src/founder/projectSpaceBindingGraph.js';
import {
  buildToolLaneQualifications,
  formatToolQualificationSummaryLines,
} from '../src/founder/toolPlane/toolLaneQualification.js';
import {
  buildSecretSourceGraph,
  formatSecretSourceGraphCompactLines,
} from '../src/founder/secretSourceGraph.js';

function takeArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

const fixturePath = takeArg('--fixture');
const psKey = takeArg('--project-space-key');
const allRecent = process.argv.includes('--all-recent');
const limit = Math.max(1, Math.min(20, Number(takeArg('--limit') || 5)));
const jsonOnly = process.argv.includes('--json');

/**
 * founder 본문으로 흐르지 않는 내부 CLI 용 redaction.
 * deliveryReadiness.js 가 이미 대부분 처리하지만, sink_ref (url/project ref) 도 한 번 더 청소.
 */
function redactSecretLike(raw) {
  let s = raw == null ? '' : String(raw);
  s = s.replace(/https?:\/\/\S+/g, '[url]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]');
  s = s.replace(/\b(?:sk|pk|ghp|gho|ghu|glpat|xox[abpsor])[_-][A-Za-z0-9._-]{10,}/g, '[redacted]');
  s = s.replace(/\beyJ[A-Za-z0-9._-]{10,}/g, '[redacted-jwt]');
  s = s.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (m.length >= 32 ? '[redacted]' : m));
  return s;
}

// internal jargon 필터 (runtime 토큰 누수 방어선)
function stripInternalJargon(line) {
  let s = String(line || '');
  s = s.replace(/workcell:[A-Za-z0-9_\-]+/g, '');
  s = s.replace(/persona:[A-Za-z0-9_\-]+/g, '');
  return s.trim();
}

function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => stripInternalJargon(redactSecretLike(l)))
    .filter((l) => l && l.length > 0);
}

async function loadFixture(p) {
  const abs = path.resolve(p);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (parsed && Array.isArray(parsed.spaces)) return parsed.spaces;
  throw new Error('fixture must be { spaces: [...] }');
}

async function listRecentDistinctProjectSpaceKeys(maxSpaces) {
  let createSb = null;
  try {
    ({ createCosRuntimeSupabaseForSummary: createSb } = await import(
      '../src/founder/runStoreSupabase.js'
    ));
  } catch {
    return null;
  }
  const sb = typeof createSb === 'function' ? createSb() : null;
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('cos_runs')
      .select('project_space_key, updated_at')
      .not('project_space_key', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(Math.max(10, maxSpaces * 5));
    if (error) return null;
    const seen = new Set();
    const keys = [];
    for (const row of data || []) {
      const k = row && row.project_space_key ? String(row.project_space_key).trim() : '';
      if (!k || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
      if (keys.length >= maxSpaces) break;
    }
    return keys;
  } catch {
    return null;
  }
}

/** Fixture 한 개에 대해 readiness 블록을 만든다. */
function buildFromFixture(entry) {
  const key = entry && entry.project_space_key ? String(entry.project_space_key).trim() : '';
  if (!key) return null;
  const report = buildDeliveryReadiness({
    project_space_key: key,
    binding_graph: entry.binding_graph || null,
    open_human_gates: Array.isArray(entry.open_human_gates) ? entry.open_human_gates : [],
    recent_propagation_runs: Array.isArray(entry.recent_propagation_runs)
      ? entry.recent_propagation_runs
      : [],
  });
  const bindingGraphLines = formatBindingGraphCompactLines(entry.binding_graph || null);
  const toolLines = Array.isArray(entry.tool_qualifications)
    ? formatToolQualificationSummaryLines(entry.tool_qualifications, 6)
    : [];
  // W12-B: secret_source_graph compact lines
  let secretGraphLines = [];
  try {
    const requirements = Array.isArray(entry.binding_requirements) ? entry.binding_requirements : [];
    if (requirements.length > 0) {
      const graph = buildSecretSourceGraph({
        project_space_key: key,
        requirements,
        existingBindings:
          (entry.binding_graph && Array.isArray(entry.binding_graph.bindings)
            ? entry.binding_graph.bindings
            : []) || [],
      });
      secretGraphLines = formatSecretSourceGraphCompactLines(graph);
    }
  } catch {
    secretGraphLines = [];
  }
  return assembleBlock(
    report,
    bindingGraphLines,
    toolLines,
    entry.recent_propagation_runs || [],
    secretGraphLines,
  );
}

function assembleBlock(report, bindingGraphLines, toolLines, propagationRuns, secretGraphLines = []) {
  if (!report) return null;
  const runs = Array.isArray(propagationRuns) ? propagationRuns : [];
  const lastFailures = [];
  for (const r of runs.slice(0, 3)) {
    const run = (r && r.run) || {};
    const steps = Array.isArray(r && r.steps) ? r.steps : [];
    const failed = steps.find((s) => s && s.verification_result === 'failed');
    const modes = [
      ...new Set(steps.map((s) => s && s.verification_kind).filter(Boolean)),
    ].join(',');
    lastFailures.push(
      `run:${String(run.id || '').slice(0, 8)} status=${run.status || '?'} modes=${modes || '-'} class=${
        run.failure_resolution_class || (failed && failed.failure_resolution_class) || '-'
      }`,
    );
  }

  // W12-D: verdict 세분화 — delivery_readiness 에서 온 verdict 를 기본으로 두되,
  // 연관 propagation run 이 technical_capability_missing 을 반환했거나 secret graph 에
  // 요구 역량이 없는 sink 가 있으면 'needs_verification' 을 선택적으로 승격 힌트 라인으로 붙인다.
  const capabilityLines = [];
  for (const r of runs) {
    const run = (r && r.run) || {};
    if (run.failure_resolution_class === 'technical_capability_missing') {
      capabilityLines.push(
        `capability_missing run=${String(run.id || '').slice(0, 8)} class=technical_capability_missing`,
      );
    }
  }

  let verdict = report.verdict;
  if (
    verdict === 'ready' &&
    (capabilityLines.length > 0 || (Array.isArray(secretGraphLines) && secretGraphLines.some((l) => / gate=Y/.test(l))))
  ) {
    verdict = 'needs_verification';
  }

  return {
    project_space_key: report.project_space_key,
    verdict,
    unresolved_count: report.unresolved_count,
    delivery_readiness_compact_lines: cleanLines(report.delivery_readiness_compact_lines),
    unresolved_human_gates_compact_lines: cleanLines(report.unresolved_human_gates_compact_lines),
    last_propagation_failures_lines: cleanLines(
      report.last_propagation_failures_lines.length > 0
        ? report.last_propagation_failures_lines
        : lastFailures,
    ),
    tool_qualification_summary_lines: cleanLines(toolLines),
    binding_graph_compact_lines: cleanLines(bindingGraphLines),
    secret_source_graph_compact_lines: cleanLines(secretGraphLines),
    capability_verification_lines: cleanLines(capabilityLines),
  };
}

async function buildFromLive(key) {
  const report = await loadDeliveryReadiness(key, { limit });
  if (!report) return null;
  let graph = null;
  try {
    graph = await buildBindingGraph(key);
  } catch {
    graph = null;
  }
  const bindingGraphLines = formatBindingGraphCompactLines(graph);
  let toolLines = [];
  try {
    const quals = await buildToolLaneQualifications({ env: process.env });
    toolLines = formatToolQualificationSummaryLines(quals, 6);
  } catch {
    toolLines = [];
  }
  let recent = [];
  try {
    const { listRecentPropagationRunsForSpace } = await import(
      '../src/founder/envSecretPropagationEngine.js'
    );
    recent = await listRecentPropagationRunsForSpace(key, { limit });
  } catch {
    recent = [];
  }
  return assembleBlock(report, bindingGraphLines, toolLines, recent);
}

function renderBlock(block) {
  const lines = [];
  lines.push(`[space=${block.project_space_key}] verdict=${block.verdict}`);
  for (const l of block.delivery_readiness_compact_lines) lines.push(`  delivery: ${l}`);
  for (const l of block.unresolved_human_gates_compact_lines) lines.push(`  gate: ${l}`);
  for (const l of block.last_propagation_failures_lines) lines.push(`  propagation: ${l}`);
  for (const l of block.tool_qualification_summary_lines) lines.push(`  tool: ${l}`);
  for (const l of block.binding_graph_compact_lines) lines.push(`  binding: ${l}`);
  for (const l of block.secret_source_graph_compact_lines || []) lines.push(`  secret-graph: ${l}`);
  for (const l of block.capability_verification_lines || []) lines.push(`  capability: ${l}`);
  return lines.join('\n');
}

async function main() {
  let blocks = [];
  let source = 'none';

  if (fixturePath) {
    const spaces = await loadFixture(fixturePath);
    source = 'fixture';
    for (const entry of spaces) {
      const b = buildFromFixture(entry);
      if (b) blocks.push(b);
    }
  } else {
    let keys = [];
    if (psKey) {
      keys.push(String(psKey).trim());
    } else if (allRecent) {
      const fetched = await listRecentDistinctProjectSpaceKeys(limit);
      if (fetched) {
        keys = fetched;
        source = 'supabase';
      }
    }
    if (!keys.length && !fixturePath) {
      // try supabase one shot even without --all-recent
      const fetched = await listRecentDistinctProjectSpaceKeys(limit);
      if (fetched && fetched.length > 0) {
        keys = fetched;
        source = 'supabase';
      }
    }
    if (!keys.length) {
      const skipped = {
        status: 'skipped',
        reason:
          'no --fixture, no --project-space-key, and Supabase credentials unavailable — nothing to audit',
        blocks: [],
      };
      if (jsonOnly) process.stdout.write(`${JSON.stringify(skipped, null, 2)}\n`);
      else
        process.stdout.write(
          'audit-delivery-readiness: skipped (자격 없음 · --fixture/--project-space-key 미지정)\n',
        );
      return;
    }
    if (source === 'none') source = psKey ? 'project-space-key' : 'supabase';
    for (const k of keys) {
      const b = await buildFromLive(k);
      if (b) blocks.push(b);
    }
  }

  if (jsonOnly) {
    process.stdout.write(
      `${JSON.stringify({ source, blocks_count: blocks.length, blocks }, null, 2)}\n`,
    );
    return;
  }

  process.stdout.write(`source=${source} · spaces=${blocks.length}\n`);
  for (const b of blocks) {
    process.stdout.write(`${renderBlock(b)}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(
    `audit-delivery-readiness crashed: ${err && err.message ? err.message : err}\n`,
  );
  process.exit(3);
});
