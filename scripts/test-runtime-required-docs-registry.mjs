/**
 * W0: runtime_required_docs.json 이 유효하고 전역 필독 파일이 존재하며, preflight 스크립트가 매니페스트를 생성한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const regPath = path.join(REPO_ROOT, 'docs', 'runtime_required_docs.json');
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
assert.equal(reg.schema_version, 1);
assert.ok(Array.isArray(reg.global_required) && reg.global_required.length >= 2);
for (const rel of reg.global_required) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `global required exists: ${rel}`);
}
const ws = reg.workstream_required && typeof reg.workstream_required === 'object' ? reg.workstream_required : {};
const expectedWs = new Set([
  'orchestrator_toolplane',
  'harness_runtime',
  'truth_tenancy',
  'release_ops',
  'founder_surface',
  'scenario1_spinup',
  'scenario2_bundle',
  'failure_taxonomy',
  'project_space_binding',
  'scenario_proof_harness',
  'proactive_cos_ops',
  'live_binding_propagation',
  'scenario_proof_live',
  'proactive_actuation_audit_only',
  'internal_alpha_qualification',
  'design_partner_beta_qualification',
]);
for (const k of Object.keys(ws)) assert.ok(expectedWs.has(k), `unexpected workstream key: ${k}`);
for (const k of expectedWs) assert.ok(ws[k], `missing workstream: ${k}`);

const node = process.execPath;
const preflight = path.join(__dirname, 'preflight_required_docs.mjs');
const taskId = `ci_smoke_${Date.now()}`;
const manifestPath = path.join(REPO_ROOT, 'ops', 'preflight_manifest', `${taskId}.json`);
const r = spawnSync(node, [preflight, '--task-id', taskId, '--workstream', 'founder_surface'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assert.equal(r.status, 0, r.stderr || r.stdout);
assert.ok(fs.existsSync(manifestPath));
const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(man.task_id, taskId);
assert.ok(Array.isArray(man.chunks) && man.chunks.length >= 1);
for (const c of man.chunks) {
  assert.ok(c.path && c.start_line >= 1 && c.end_line >= c.start_line && c.sha256 && c.sha256.length === 64);
}
fs.unlinkSync(manifestPath);

console.log('test-runtime-required-docs-registry: ok');
