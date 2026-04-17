#!/usr/bin/env node
/**
 * W13-E — Harness Quality Proof audit CLI.
 *
 * Inputs: fixture file (JSON) or Supabase-backed project_space scope.
 * Output: HarnessQualityProofReadModel + compact lines + evidence_grade.
 *
 * Usage:
 *   node scripts/audit-harness-quality-proof.mjs --fixture path/to/fixture.json
 *   node scripts/audit-harness-quality-proof.mjs --project-space-key <key>   # Supabase mode
 *   node scripts/audit-harness-quality-proof.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHarnessQualityProofReadModel,
  toQualityProofCompactLines,
} from '../src/founder/harnessQualityProofReadModel.js';

function parseArgs(argv) {
  const out = { fixture: '', projectSpaceKey: '', json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixture') out.fixture = String(argv[++i] || '');
    else if (a === '--project-space-key') out.projectSpaceKey = String(argv[++i] || '');
    else if (a === '--json') out.json = true;
  }
  return out;
}

function readFixture(fixturePath) {
  const abs = path.isAbsolute(fixturePath) ? fixturePath : path.resolve(process.cwd(), fixturePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`fixture not found: ${abs}`);
  }
  const j = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return {
    workcell_sessions: j.workcell_sessions || [],
    scenario_envelopes: j.scenario_envelopes || [],
    human_gate_rows: j.human_gate_rows || [],
    run_rows: j.run_rows || [],
  };
}

async function loadFromSupabase(projectSpaceKey) {
  const { listHumanGatesForProjectSpace, listRecentPropagationRuns } = await import(
    '../src/founder/projectSpaceBindingStore.js'
  ).catch(() => ({ listHumanGatesForProjectSpace: null, listRecentPropagationRuns: null }));

  const gates = listHumanGatesForProjectSpace
    ? await listHumanGatesForProjectSpace({ project_space_key: projectSpaceKey }).catch(() => [])
    : [];
  return {
    workcell_sessions: [],
    scenario_envelopes: [],
    human_gate_rows: Array.isArray(gates) ? gates : [],
    run_rows: [],
  };
}

const invokedDirectly = (() => {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const args = parseArgs(process.argv);
  (async () => {
    let input;
    if (args.fixture) {
      input = readFixture(args.fixture);
    } else if (args.projectSpaceKey) {
      input = await loadFromSupabase(args.projectSpaceKey);
    } else {
      console.error('Usage: --fixture <path> OR --project-space-key <key>');
      process.exit(2);
    }
    const rm = buildHarnessQualityProofReadModel(input);
    const lines = toQualityProofCompactLines(rm);
    if (args.json) {
      console.log(JSON.stringify({ read_model: rm, compact_lines: lines }, null, 2));
    } else {
      console.log(`[audit-harness-quality-proof] evidence_grade=${rm.evidence_grade}`);
      for (const ln of lines) console.log(` - ${ln}`);
      if (lines.length === 0) console.log(' (evidence absent — no quality claim)');
    }
  })().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
