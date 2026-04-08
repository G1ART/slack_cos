#!/usr/bin/env node
/**
 * Ops-only: summarize recent COS ops smoke sessions from local cos_run_events JSONL.
 * Does not connect to Slack or Cursor. Set COS_RUNTIME_STATE_DIR or --state-dir to your runtime dir.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { aggregateSmokeSessionProgress } from '../src/founder/smokeOps.js';

function parseArgs() {
  const out = { runId: null, limit: 5, stateDir: null };
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
    if (a[i] === '--state-dir' && a[i + 1]) {
      out.stateDir = a[++i];
      continue;
    }
  }
  return out;
}

function runtimeBase(stateDir) {
  const env = String(stateDir || process.env.COS_RUNTIME_STATE_DIR || '').trim();
  return env ? path.resolve(env) : path.join(os.tmpdir(), 'g1cos-runtime');
}

async function readJsonl(fp) {
  try {
    const raw = await fs.readFile(fp, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const args = parseArgs();
const base = runtimeBase(args.stateDir);
const eventsDir = path.join(base, 'cos_run_events');

let files = [];
if (args.runId) {
  files = [path.join(eventsDir, `${args.runId}.jsonl`)];
} else {
  try {
    const names = await fs.readdir(eventsDir);
    files = names.filter((n) => n.endsWith('.jsonl')).map((n) => path.join(eventsDir, n));
  } catch (e) {
    console.error(`No cos_run_events directory (or unreadable): ${eventsDir}`);
    console.error(String(e && e.message ? e.message : e));
    process.exit(2);
  }
}

/** @type {Map<string, { run_id: string, rows: { event_type: string, payload: Record<string, unknown> }[] }>} */
const bySession = new Map();

for (const fp of files) {
  const runId = path.basename(fp, '.jsonl');
  const rows = await readJsonl(fp);
  for (const row of rows) {
    if (String(row.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sid = String(pl.smoke_session_id || '').trim();
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, { run_id: runId, rows: [] });
    const bucket = bySession.get(sid);
    bucket.rows.push({ event_type: row.event_type, payload: pl });
    if (bucket.run_id !== runId) bucket.run_id = `${bucket.run_id}+${runId}`;
  }
}

const sessions = [...bySession.entries()].map(([smoke_session_id, { run_id, rows }]) => {
  const agg = aggregateSmokeSessionProgress(rows);
  const lastAt = rows.reduce((m, r) => {
    const t = String(r.payload?.at || '');
    return t > m ? t : m;
  }, '');
  return { smoke_session_id, run_id, lastAt, ...agg };
});

sessions.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

const limited = args.runId ? sessions : sessions.slice(0, args.limit);

if (!limited.length) {
  console.log('No ops_smoke_phase events found.');
  process.exit(0);
}

for (const s of limited) {
  console.log('---');
  console.log(`smoke_session_id: ${s.smoke_session_id}`);
  console.log(`run_id (file):    ${s.run_id}`);
  console.log(`last_at:          ${s.lastAt || '(unknown)'}`);
  console.log(`final_status:     ${s.final_status}`);
  console.log(`breaks_at:        ${s.breaks_at ?? '(none — full pipeline)'}`);
  console.log(`phases_seen:      ${s.phases_seen.join(', ')}`);
}

console.log('---');
console.log(`Listed ${limited.length} session(s). Base: ${base}`);
