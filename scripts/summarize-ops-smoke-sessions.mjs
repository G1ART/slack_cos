#!/usr/bin/env node
/**
 * Ops-only: summarize COS ops smoke sessions from cos_run_events (file | memory | supabase).
 * Read-only. Does not log raw payloads. Optional: COS_RUNTIME_STATE_DIR, COS_RUNTIME_SUPABASE_* or SUPABASE_*.
 */
import path from 'node:path';
import os from 'node:os';
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
      console.error('Supabase mode requires URL + service role key (env or --supabase-url / --supabase-key).');
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
    console.log('No ops_smoke_phase events found.');
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
  }

  console.log('---');
  console.log(`Listed ${limited.length} session(s). Source: ${baseLabel}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
