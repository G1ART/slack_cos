/**
 * vNext.13.48 — Trigger audit JSON does not echo URL hosts or bearer material (field names + flags only).
 */
import assert from 'node:assert';
import { buildSafeTriggerSmokeDetail } from '../src/founder/smokeOps.js';

const tr = {
  ok: true,
  status: 200,
  response_top_level_keys: ['run', 'meta'],
  trigger_status: 'accepted',
  external_run_id: 'runid_tail_source',
  external_url: 'https://cursor-automation.example/internal/secret-path',
  automation_status_raw: 'Bearer supersecret_must_not_appear',
  has_run_id: true,
  has_status: true,
  has_url: true,
  selected_run_id_field_name: 'run.id',
  selected_status_field_name: 'status',
  selected_url_field_name: 'url',
};

const d = buildSafeTriggerSmokeDetail(tr);
const json = JSON.stringify(d);
assert.ok(!json.includes('cursor-automation.example'), 'no URL host');
assert.ok(!json.includes('supersecret'), 'no bearer');
assert.ok(d.has_url === true && d.has_run_id === true);
assert.equal(d.selected_run_id_field_name, 'run.id');

console.log('test-trigger-response-safe-subset-audit-no-secrets: ok');
