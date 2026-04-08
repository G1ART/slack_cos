#!/usr/bin/env node
/**
 * Ops-only: summarize COS ops smoke sessions from cos_run_events (file | memory | supabase).
 * Read-only. Does not log raw payloads. Optional: COS_RUNTIME_STATE_DIR, COS_RUNTIME_SUPABASE_* or SUPABASE_*.
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { createCosRuntimeSupabaseForSummary } from '../src/founder/runStoreSupabase.js';
import { listOpsSmokePhaseEventsForSummary } from '../src/founder/runCosEvents.js';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

function parseArgs() {
  const out = {
    runId: null,
    limit: 5,
    stateDir: null,
    store: null,
    compact: false,
    maxRows: 2000,
    supabaseUrl: null,
    supabaseKey: null,
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--run-id' && a[i + 1]) {
      out.runId = a[++i];
      continue;
    }
    if (a[i] === '--limit' && a[i + 1]) {
      out.limit = Math.max(1, parseInt(a[i + 1], 10) || 5);
      i += 1;
      continue;
    }
    if (a[i] === '--max-rows' && a[i + 1]) {
      out.maxRows = Math.max(1, parseInt(a[i + 1], 10) || 2000);
      i += 1;
      continue;
    }
    if (a[i] === '--state-dir' && a[i + 1]) {
      out.stateDir = a[++i];
      continue;
    }
    if (a[i] === '--store' && a[i + 1]) {
      out.store = String(a[++i] || '').trim().toLowerCase();
      continue;
    }
    if (a[i] === '--supabase-url' && a[i + 1]) {
      out.supabaseUrl = a[++i];
      continue;
    }
    if (a[i] === '--supabase-key' && a[i + 1]) {
      out.supabaseKey = a[++i];
      continue;
    }
    if (a[i] === '--compact') {
      out.compact = true;
    }
  }
  return out;
}

function runtimeBase(stateDir) {
  const env = String(stateDir || process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

async function main() {
  const args = parseArgs();
  let modeOverride =
    args.store === 'file' || args.store === 'memory' || args.store === 'supabase' ? args.store : null;

  let supabaseClient = null;
  if (modeOverride === 'supabase' || (!modeOverride && (args.supabaseUrl || args.supabaseKey))) {
    supabaseClient = createCosRuntimeSupabaseForSummary(
      process.env,
      args.supabaseUrl || undefined,
      args.supabaseKey || undefined,
    );
    if (!supabaseClient) {
      console.error(
        'Supabase mode needs URL + service role key: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or COS_RUNTIME_*),',
      );
      console.error(
        'or pass --supabase-url / --supabase-key. This script loads .env from the repo root next to package.json.',
      );
      process.exit(2);
    }
    if (!modeOverride) modeOverride = 'supabase';
  }

  const flatRows = await listOpsSmokePhaseEventsForSummary({
    runId: args.runId,
    maxRows: args.maxRows,
    modeOverride,
    runtimeStateDir: args.stateDir,
    supabaseClient,
  });

  const summaries = summarizeOpsSmokeSessionsFromFlatRows(flatRows, { sessionLimit: 500 });
  const limited = args.runId ? summaries : summaries.slice(0, args.limit);

  if (!limited.length) {
    console.log('No ops smoke summary events (cos_run_events + cos_ops_smoke_events).');
    process.exit(0);
  }

  const baseLabel =
    modeOverride === 'supabase'
      ? '(supabase)'
      : modeOverride === 'memory'
        ? '(memory)'
        : runtimeBase(args.stateDir);

  if (args.compact) {
    for (const s of limited) {
      console.log(
        JSON.stringify({
          smoke_session_id: s.smoke_session_id,
          run_id: s.run_id,
          final_status: s.final_status,
          breaks_at: s.breaks_at,
          phases_seen: s.phases_seen,
          ordered_events: s.ordered_events,
          call_name: s.call_name,
          selected_tool: s.selected_tool,
          selected_action: s.selected_action,
          delegate_packets_present: s.delegate_packets_present,
          delegate_live_patch_present: s.delegate_live_patch_present,
          payload_top_level_keys: s.payload_top_level_keys,
          blocked_reason: s.blocked_reason,
          machine_hint: s.machine_hint,
          missing_required_fields: s.missing_required_fields,
          response_top_level_keys: s.response_top_level_keys,
          selected_run_id_field_name: s.selected_run_id_field_name,
          selected_status_field_name: s.selected_status_field_name,
          selected_url_field_name: s.selected_url_field_name,
          has_run_id: s.has_run_id,
          has_status: s.has_status,
          has_url: s.has_url,
        }),
      );
    }
    console.log(JSON.stringify({ listed: limited.length, source: baseLabel }));
    return;
  }

  for (const s of limited) {
    console.log('---');
    console.log(`smoke_session_id: ${s.smoke_session_id}`);
    console.log(`run_id:           ${s.run_id}`);
    console.log(`last_at:          ${s.lastAt || '(unknown)'}`);
    console.log(`final_status:     ${s.final_status}`);
    console.log(`breaks_at:        ${s.breaks_at ?? '(none — full pipeline)'}`);
    console.log(`phases_seen:      ${s.phases_seen.join(', ')}`);
    console.log(`ordered_events:   ${JSON.stringify(s.ordered_events)}`);
    console.log(`call_name:                ${s.call_name ?? '(n/a)'}`);
    console.log(`selected_tool:            ${s.selected_tool ?? '(n/a)'}`);
    console.log(`selected_action:          ${s.selected_action ?? '(n/a)'}`);
    console.log(`delegate_packets_present: ${s.delegate_packets_present ?? '(n/a)'}`);
    console.log(`delegate_live_patch_present: ${s.delegate_live_patch_present ?? '(n/a)'}`);
    console.log(
      `payload_top_level_keys:   ${s.payload_top_level_keys != null ? JSON.stringify(s.payload_top_level_keys) : '(n/a)'}`,
    );
    console.log(`blocked_reason:           ${s.blocked_reason ?? '(n/a)'}`);
    console.log(`machine_hint:             ${s.machine_hint ?? '(n/a)'}`);
    console.log(
      `missing_required_fields:  ${s.missing_required_fields != null ? JSON.stringify(s.missing_required_fields) : '(n/a)'}`,
    );
    console.log(
      `response_top_level_keys:    ${s.response_top_level_keys != null ? JSON.stringify(s.response_top_level_keys) : '(n/a)'}`,
    );
    console.log(`selected_run_id_field_name: ${s.selected_run_id_field_name ?? '(n/a)'}`);
    console.log(`selected_status_field_name: ${s.selected_status_field_name ?? '(n/a)'}`);
    console.log(`selected_url_field_name:    ${s.selected_url_field_name ?? '(n/a)'}`);
    console.log(`has_run_id:                   ${s.has_run_id ?? '(n/a)'}`);
    console.log(`has_status:                   ${s.has_status ?? '(n/a)'}`);
    console.log(`has_url:                      ${s.has_url ?? '(n/a)'}`);
  }

  console.log('---');
  console.log(`Listed ${limited.length} session(s). Source: ${baseLabel}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
