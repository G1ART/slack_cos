/**
 * W12-D — audit verdict: delivery_readiness 가 ready 여도 최근 propagation run 에
 * technical_capability_missing 이 있으면 verdict 가 needs_verification 으로 승격된다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-audit-verify-'));
const fixturePath = path.join(tmp, 'fixture.json');
const fixture = {
  spaces: [
    {
      project_space_key: 'ps_ready_with_cap_miss',
      binding_graph: {
        bindings: [],
        unfulfilled_requirements: [],
        satisfied_requirements: [],
      },
      open_human_gates: [],
      recent_propagation_runs: [
        {
          run: {
            id: 'run-cap-miss-000',
            status: 'succeeded',
            verification_modes_attempted_array: [],
            failure_resolution_class: 'technical_capability_missing',
          },
          steps: [],
        },
      ],
    },
  ],
};
fs.writeFileSync(fixturePath, JSON.stringify(fixture));

const out = spawnSync(
  'node',
  ['scripts/audit-delivery-readiness.mjs', '--fixture', fixturePath, '--json'],
  {
    encoding: 'utf8',
    env: { ...process.env, COS_RUN_STORE: 'memory' },
  },
);
assert.equal(out.status, 0, `script exit: stderr=${out.stderr}`);
const payload = JSON.parse(out.stdout);
assert.ok(Array.isArray(payload.blocks) && payload.blocks.length === 1, 'one block');
const block = payload.blocks[0];
assert.equal(block.verdict, 'needs_verification', `verdict=${block.verdict}`);
assert.ok(
  Array.isArray(block.capability_verification_lines) &&
    block.capability_verification_lines.length > 0,
  'capability_verification_lines populated',
);

console.log('test-audit-delivery-readiness-needs-verification-distinguished: ok');
