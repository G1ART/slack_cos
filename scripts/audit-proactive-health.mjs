#!/usr/bin/env node
/**
 * W7-A — Proactive COS ops health audit CLI.
 *
 * audit:parcel-health 와 동일한 운영 감사 패턴을 따른다:
 *   - 자격 없으면(환경 미설정) skipped 출력 후 exit 0
 *   - `--json` 플래그로 기계가 읽을 수 있는 덤프
 *   - `--fixture <path>` 로 in-memory 입력을 주입해 테스트 가능
 *
 * 본 CLI 는 **Slack 송신 경로를 만들지 않는다.** 단지 현재 관찰 가능한 truth 로부터
 * PROACTIVE_SIGNAL_KINDS 의 6종 신호를 roll-up 하여 compact_lines / JSON 으로 출력한다.
 *
 * 사용:
 *   node scripts/audit-proactive-health.mjs --fixture ops/fixtures/proactive_demo.json
 *   node scripts/audit-proactive-health.mjs --fixture ops/fixtures/proactive_demo.json --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProactiveSignals, PROACTIVE_SIGNAL_KINDS } from '../src/founder/proactiveSignals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @param {string[]} argv */
function parseArgs(argv) {
  let json = false;
  /** @type {string | null} */
  let fixture = null;
  let staleRunMinutes = 30;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--fixture') {
      fixture = argv[i + 1] || null;
      i += 1;
    } else if (a === '--stale-run-minutes') {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v > 0) staleRunMinutes = v;
      i += 1;
    }
  }
  return { json, fixture, staleRunMinutes };
}

async function main() {
  const { json, fixture, staleRunMinutes } = parseArgs(process.argv.slice(2));

  /** @type {Record<string, unknown>} */
  let input = {};
  if (fixture) {
    const full = path.isAbsolute(fixture) ? fixture : path.resolve(process.cwd(), fixture);
    if (!fs.existsSync(full)) {
      console.error(JSON.stringify({ event: 'audit_proactive_health_fixture_missing', path: full }));
      process.exit(2);
    }
    try {
      input = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.error(JSON.stringify({ event: 'audit_proactive_health_fixture_parse_failed', error: e.message }));
      process.exit(2);
    }
  } else {
    // 현재 시점의 Supabase 경로는 사용자 자격이 있어야만 의미가 있다.
    // CLI 가 무자격으로 실행되면 skipped — audit:parcel-health 와 동일한 계약.
    const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!hasSupabase) {
      const body = {
        ok: true,
        skipped: true,
        reason: 'no_supabase_credentials',
        signal_kinds: PROACTIVE_SIGNAL_KINDS,
        compact_lines: [],
        signals: [],
      };
      if (json) {
        process.stdout.write(JSON.stringify(body, null, 2) + '\n');
      } else {
        console.log('audit-proactive-health: skipped (no supabase credentials)');
        console.log('hint: run with --fixture <path.json> to evaluate in-memory inputs');
      }
      return;
    }
    // 기본 경로는 fixture 없이는 공백 — Supabase 연동은 이후 W7-B/closeout 에서 필요 시 확장
    input = {};
  }

  const { signals, compact_lines } = buildProactiveSignals({
    ...input,
    stale_run_minutes: staleRunMinutes,
  });

  const body = {
    ok: true,
    signal_kinds: PROACTIVE_SIGNAL_KINDS,
    compact_lines,
    signals,
  };

  if (json) {
    process.stdout.write(JSON.stringify(body, null, 2) + '\n');
    return;
  }
  console.log(`audit-proactive-health: ${signals.length} signals`);
  for (const l of compact_lines) console.log(l);
}

main().catch((e) => {
  console.error(JSON.stringify({ event: 'audit_proactive_health_failed', error: e.message }));
  process.exit(1);
});
