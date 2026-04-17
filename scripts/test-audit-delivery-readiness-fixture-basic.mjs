/**
 * W11-B — audit-delivery-readiness CLI fixture 모드 기본 회귀.
 * 한 project_space 에 대해 verdict + 5 블록이 JSON 으로 나오는지.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixture = path.join(os.tmpdir(), `w11b-basic-${Date.now()}.json`);
fs.writeFileSync(
  fixture,
  JSON.stringify({
    spaces: [
      {
        project_space_key: 'ps_fix_ready',
        binding_graph: {
          project_space_key: 'ps_fix_ready',
          project_space: { project_space_key: 'ps_fix_ready', display_name: 'Ready' },
          bindings: [
            { binding_kind: 'repo_binding', binding_ref: 'acme/alpha-web' },
          ],
          unfulfilled_requirements: [],
          satisfied_requirements: [],
        },
        open_human_gates: [],
        recent_propagation_runs: [
          {
            run: {
              id: 'abcdef0123456789',
              status: 'succeeded',
              started_at: '2026-04-16T01:00:00Z',
              failure_resolution_class: null,
            },
            steps: [
              {
                step_index: 0,
                verification_kind: 'smoke',
                verification_result: 'ok',
                sink_system: 'github',
                binding_name: 'OPENAI_API_KEY',
              },
            ],
          },
        ],
        tool_qualifications: [
          {
            tool: 'github',
            declared: true,
            live_capable: true,
            configured: true,
            reason: 'ok',
            missing: [],
          },
        ],
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
assert.equal(parsed.source, 'fixture');
assert.equal(parsed.blocks.length, 1);
const b = parsed.blocks[0];
assert.equal(b.project_space_key, 'ps_fix_ready');
assert.equal(b.verdict, 'ready');
// 5 compact-line 블록이 모두 array
assert.ok(Array.isArray(b.delivery_readiness_compact_lines));
assert.ok(Array.isArray(b.unresolved_human_gates_compact_lines));
assert.ok(Array.isArray(b.last_propagation_failures_lines));
assert.ok(Array.isArray(b.tool_qualification_summary_lines));
assert.ok(Array.isArray(b.binding_graph_compact_lines));
// delivery 헤더 줄 첫 줄
assert.ok(b.delivery_readiness_compact_lines[0].includes('verdict=ready'));

console.log('test-audit-delivery-readiness-fixture-basic: ok');
