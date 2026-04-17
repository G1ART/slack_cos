/**
 * W11-B — smoke 와 (read-back) verified 가 compact line 에서 구분 가능해야 한다.
 * registry 상 verification_modes_used 에 smoke/read_back 이 각각 반영.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixture = path.join(os.tmpdir(), `w11b-smoke-verified-${Date.now()}.json`);
fs.writeFileSync(
  fixture,
  JSON.stringify({
    spaces: [
      {
        project_space_key: 'ps_smoke_only',
        binding_graph: {
          project_space_key: 'ps_smoke_only',
          project_space: null,
          bindings: [],
          unfulfilled_requirements: [],
          satisfied_requirements: [],
        },
        open_human_gates: [],
        recent_propagation_runs: [
          {
            run: { id: 'run_smoke_01', status: 'verify_pending' },
            steps: [
              {
                step_index: 0,
                verification_kind: 'smoke',
                verification_result: 'ok',
                sink_system: 'supabase',
                binding_name: 'SUPABASE_ANON_KEY',
              },
            ],
          },
        ],
        tool_qualifications: [],
      },
      {
        project_space_key: 'ps_verified',
        binding_graph: {
          project_space_key: 'ps_verified',
          project_space: null,
          bindings: [],
          unfulfilled_requirements: [],
          satisfied_requirements: [],
        },
        open_human_gates: [],
        recent_propagation_runs: [
          {
            run: { id: 'run_verif_01', status: 'succeeded' },
            steps: [
              {
                step_index: 0,
                verification_kind: 'read_back',
                verification_result: 'ok',
                sink_system: 'vercel',
                binding_name: 'OPENAI_API_KEY',
              },
            ],
          },
        ],
        tool_qualifications: [],
      },
    ],
  }),
);

const res = spawnSync(
  process.execPath,
  ['scripts/audit-delivery-readiness.mjs', '--fixture', fixture, '--json'],
  { encoding: 'utf8' },
);
assert.equal(res.status, 0, `exit 0, stderr=${res.stderr}`);
const parsed = JSON.parse(res.stdout);
assert.equal(parsed.blocks.length, 2);

const smokeBlock = parsed.blocks.find((b) => b.project_space_key === 'ps_smoke_only');
const verifiedBlock = parsed.blocks.find((b) => b.project_space_key === 'ps_verified');
assert.ok(smokeBlock && verifiedBlock);

const smokeLine = smokeBlock.last_propagation_failures_lines.join('\n');
const verifiedLine = verifiedBlock.last_propagation_failures_lines.join('\n');

// 구분 가능해야 한다 (smoke vs read_back)
assert.ok(smokeLine.includes('modes=smoke'), `smoke block must mention smoke: ${smokeLine}`);
assert.ok(
  verifiedLine.includes('modes=read_back'),
  `verified block must mention read_back: ${verifiedLine}`,
);
assert.ok(!smokeLine.includes('read_back'), 'smoke-only must NOT claim read_back');

console.log('test-audit-delivery-readiness-smoke-vs-verified-distinguished: ok');
