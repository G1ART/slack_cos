#!/usr/bin/env node
/**
 * W9 CLI — run-scenario-proof-live.
 *
 * 사용:
 *   node scripts/run-scenario-proof-live.mjs                     # fixture replay 기본
 *   node scripts/run-scenario-proof-live.mjs --live              # live_openai (COS_SCENARIO_LIVE_OPENAI=1 필요)
 *   node scripts/run-scenario-proof-live.mjs --fixture <path1> --fixture <path2>
 *   node scripts/run-scenario-proof-live.mjs --only scenario_1_multi_project_spinup
 *   node scripts/run-scenario-proof-live.mjs --json               # envelope 배열 + scorecard JSON 만 출력
 *
 * 출력: stdout 에 scorecard summary + compact_lines(한국어) + classification 요약.
 * envelope 전체는 --json 모드 또는 개별 러너 --write 경로에 기록.
 */

import fs from 'node:fs';
import path from 'node:path';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';

function takeArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function takeAllArgs(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

const runMode = process.argv.includes('--live') ? 'live_openai' : 'fixture_replay';
const writeToDisk = process.argv.includes('--write');
const jsonOnly = process.argv.includes('--json');
const onlyScenario = takeArg('--only');
const fixturePaths = takeAllArgs('--fixture');

const fixtures = {};
for (const p of fixturePaths) {
  const abs = path.resolve(p);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const sid = parsed.scenario_id || parsed.__scenario_id || null;
  if (sid === 'scenario_1_multi_project_spinup' || /scenario1|scenario_1/.test(path.basename(abs))) {
    fixtures.scenario1 = parsed;
  } else if (sid === 'scenario_2_research_to_bundle' || /scenario2|scenario_2/.test(path.basename(abs))) {
    fixtures.scenario2 = parsed;
  }
}

const scenarios = onlyScenario ? [onlyScenario] : undefined;

runScenarioProofLive({ runMode, writeToDisk, fixtures, scenarios })
  .then((out) => {
    if (jsonOnly) {
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      return;
    }
    process.stdout.write(`run_mode=${out.run_mode}\n`);
    process.stdout.write(
      `scorecard: total=${out.scorecard.total} passed=${out.scorecard.passed} broken=${out.scorecard.broken} inconclusive=${out.scorecard.inconclusive}\n`,
    );
    if (out.compact_lines && out.compact_lines.length) {
      for (const ln of out.compact_lines) process.stdout.write(`  · ${ln}\n`);
    }
    for (const r of out.runs) {
      if (!r.classification) {
        process.stdout.write(`  [!] build failed: ${(r.build_errors || []).join(';')}\n`);
        continue;
      }
      const c = r.classification;
      process.stdout.write(
        `  - ${c.scenario_id} · ${c.outcome} · break=${c.break_location} (${c.break_category}) · hil=${c.human_gate_required}\n`,
      );
    }
  })
  .catch((err) => {
    process.stderr.write(`run-scenario-proof-live crashed: ${err && err.message ? err.message : err}\n`);
    process.exit(3);
  });
