import assert from 'node:assert';
import {
  stripSecretsAndUrlsFromString,
  buildSafeTriggerSmokeDetail,
  buildSafeCursorCallbackSmokeDetail,
} from '../src/founder/smokeOps.js';

// Use obviously fake Bearer material — some patterns trigger host secret scanning on push.
const bearer = 'Bearer cos_ops_smoke_fixture_token_abcdefghijklmnopqrstuvwxyz012345';
const s1 = stripSecretsAndUrlsFromString(`auth ${bearer} tail`);
assert.ok(!s1.includes('cos_ops_smoke_fixture_token'), 'bearer material redacted');
assert.ok(s1.includes('[redacted_bearer]'), 'placeholder for bearer');

const s2 = stripSecretsAndUrlsFromString('before https://api.cursor.com/v1/runs/abc after');
assert.ok(!s2.includes('cursor.com'), 'hostname not kept');
assert.ok(s2.includes('[url]'), 'url placeholder');

const tr = {
  response_top_level_keys: ['id', 'status'],
  status: 200,
  trigger_status: 'queued',
  external_run_id: 'run_full_id_12345678',
  automation_status_raw: `mixed ${bearer} and https://evil.example/x`,
  automation_branch_raw: 'main',
  external_url: 'https://cursor.com/run/secret-long-path',
};
const trigDetail = buildSafeTriggerSmokeDetail(tr);
const trigJson = JSON.stringify(trigDetail);
assert.ok(!trigJson.includes('cursor.com'), 'trigger detail must not store full URL');
assert.ok(!trigJson.includes('cos_ops_smoke_fixture_token'), 'trigger detail must not store secret');
assert.ok(trigDetail.url_present === true, 'url presence flag only');

const canon = {
  external_run_id: 'cursor_run_xyz',
  occurred_at: '2026-04-01T00:00:00Z',
  thread_key_hint: 't1',
  packet_id_hint: 'p1',
  payload: {
    branch: 'feat/x',
    pr_url: 'https://github.com/org/repo/pull/42',
    summary: 'done',
  },
};
const cbDetail = buildSafeCursorCallbackSmokeDetail({
  canonical: canon,
  matched_by: 'external_correlation',
  canonical_status: 'completed',
  payload_fingerprint_prefix: 'a1b2c3d4',
  ingressEvidence: {
    source_status_field_name: 'status',
    source_run_id_field_name: 'runId',
    selected_override_keys: ['CURSOR_WEBHOOK_RUN_ID_PATH'],
  },
});
const cbJson = JSON.stringify(cbDetail);
assert.ok(!cbJson.includes('github.com'), 'callback detail must not store full PR URL');
assert.ok(cbJson.includes('has_pr_url'), 'boolean flags allowed');
assert.ok(cbDetail.has_pr_url === true);

console.log('test-smoke-evidence-redacts-secrets-and-full-urls: ok');
