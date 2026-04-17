/**
 * W11-B — CLI 출력에 secret/token/URL/JWT 가 **한 compact line 에도** 흐르지 않는지.
 * fixture 안에 일부러 sk-/ghp_/Bearer/eyJ(JWT)/긴 hex/full URL 을 심어둔다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOISY_SECRETS = [
  'sk-ABCDEF0123456789ABCDEF0123456789',
  'ghp_ABCDEF0123456789ABCDEF0123456789ABCD',
  'Bearer eyJabcdefghij0123456789',
  'eyJabcdefghij0123456789ABCDEF0123456789',
  'https://secret-tenant.supabase.co/rest/v1/',
  'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', // long hex
];

const fixture = path.join(os.tmpdir(), `w11b-leak-${Date.now()}.json`);
fs.writeFileSync(
  fixture,
  JSON.stringify({
    spaces: [
      {
        project_space_key: 'ps_leak',
        binding_graph: {
          project_space_key: 'ps_leak',
          project_space: {
            project_space_key: 'ps_leak',
            display_name: NOISY_SECRETS[0],
          },
          bindings: [
            {
              binding_kind: 'repo_binding',
              binding_ref: NOISY_SECRETS[4], // URL
            },
          ],
          unfulfilled_requirements: [
            {
              binding_kind: 'env_requirement',
              binding_name: NOISY_SECRETS[1],
              source_system: 'cos',
              sink_system: 'railway',
            },
          ],
          satisfied_requirements: [],
        },
        open_human_gates: [
          {
            id: 'gate_111122223333',
            gate_kind: 'manual_secret_entry',
            required_human_action: `값 붙여넣기: ${NOISY_SECRETS[2]}`,
            continuation_packet_id: 'pkt_leak',
          },
        ],
        recent_propagation_runs: [
          {
            run: {
              id: 'runleak0000000000',
              status: 'failed',
              failure_resolution_class: 'tool_adapter_unavailable',
            },
            steps: [
              {
                step_index: 0,
                verification_kind: 'smoke',
                verification_result: 'failed',
                sink_system: 'supabase',
                sink_ref: NOISY_SECRETS[4],
                binding_name: NOISY_SECRETS[3],
                failure_resolution_class: 'tool_adapter_unavailable',
              },
            ],
          },
        ],
        tool_qualifications: [
          {
            tool: 'github',
            declared: true,
            live_capable: false,
            configured: false,
            reason: `raw token ${NOISY_SECRETS[5]}`,
            missing: ['GITHUB_TOKEN'],
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

// 모든 compact line 수집
const parsed = JSON.parse(res.stdout);
const allLines = [];
for (const b of parsed.blocks) {
  allLines.push(
    ...b.delivery_readiness_compact_lines,
    ...b.unresolved_human_gates_compact_lines,
    ...b.last_propagation_failures_lines,
    ...b.tool_qualification_summary_lines,
    ...b.binding_graph_compact_lines,
  );
}
const joined = allLines.join('\n');

// 어떤 compact line 에도 secret-like 토큰이 남지 않아야 함
assert.ok(!joined.includes('sk-ABCDEF'), 'no sk- token leak');
assert.ok(!joined.includes('ghp_ABCDEF'), 'no ghp_ token leak');
assert.ok(!joined.includes('eyJabcdefghij'), 'no JWT leak');
assert.ok(!/https?:\/\//.test(joined), 'no raw URL leak');
assert.ok(!joined.includes('A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6'), 'no long hex leak');

// workcell:/persona: internal jargon 도 없어야
assert.ok(!/workcell:/i.test(joined), 'no workcell: jargon');
assert.ok(!/persona:[A-Za-z0-9]/i.test(joined), 'no persona: jargon');

console.log('test-audit-delivery-readiness-no-secret-leak: ok');
