/**
 * W11-B — blocked propagation 과 open human gate 가 동시에 있으면 verdict='open_gate'.
 * (우선순위: open_gate > propagation_failed > missing_binding > ready)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixture = path.join(os.tmpdir(), `w11b-blocked-${Date.now()}.json`);
fs.writeFileSync(
  fixture,
  JSON.stringify({
    spaces: [
      {
        project_space_key: 'ps_blocked',
        binding_graph: {
          project_space_key: 'ps_blocked',
          project_space: null,
          bindings: [],
          unfulfilled_requirements: [
            {
              binding_kind: 'env_requirement',
              binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
              source_system: 'cos',
              sink_system: 'railway',
            },
          ],
          satisfied_requirements: [],
        },
        open_human_gates: [
          {
            id: 'gate_openopenopen',
            gate_kind: 'manual_secret_entry',
            required_human_action: '운영자가 값 직접 입력',
            continuation_packet_id: 'pkt_1',
            resume_target_kind: 'packet',
            reopened_count: 2,
          },
        ],
        recent_propagation_runs: [
          {
            run: {
              id: 'run_blocked01',
              status: 'failed',
              failure_resolution_class: 'hil_required',
            },
            steps: [
              {
                step_index: 0,
                verification_kind: 'smoke',
                verification_result: 'failed',
                sink_system: 'railway',
                binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
                failure_resolution_class: 'hil_required',
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
assert.equal(parsed.blocks.length, 1);
const b = parsed.blocks[0];
assert.equal(b.verdict, 'open_gate', 'open_gate wins over propagation_failed and missing_binding');

// unresolved_human_gates 라인 내에 reopened=2 + resume→packet 힌트가 노출
const gateLine = b.unresolved_human_gates_compact_lines.join('\n');
assert.ok(gateLine.includes('manual_secret_entry'));
assert.ok(gateLine.includes('reopened=2'));
assert.ok(/resume→packet/.test(gateLine));

// 비ASCII 이벤트 유지 확인 (한국어 action 이 redact 되지 않았는지)
assert.ok(b.unresolved_human_gates_compact_lines.join('\n').includes('운영자'));

// propagation 실패 블록도 여전히 남아야
assert.ok(b.last_propagation_failures_lines.length >= 1);
assert.ok(b.last_propagation_failures_lines.join('\n').includes('class=hil_required'));

console.log('test-audit-delivery-readiness-blocked-plus-open-gate: ok');
