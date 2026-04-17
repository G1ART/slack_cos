#!/usr/bin/env node
/**
 * W13-D — Bootstrap readiness audit for design-partner BYO-keys/BYO-infra install.
 *
 * Answers: “Can this repo be installed for a design partner in a dedicated BYO setup
 * without hidden missing pieces?” — as an executable audit, not a marketing doc.
 *
 * Verdicts (worst wins):
 *   - fail_unsafe_mode          COS_DESIGN_PARTNER_MODE=1 + unsafe runtime config (e.g. memory truth store)
 *   - fail_missing_prereq       required package / env / migration / packaging doc is missing
 *   - fail_drift                referenced script / doc / capability claim drifted vs. reality
 *   - pass_with_manual_gates    everything structurally present, but manual gate(s) remain
 *   - pass                      clean bootstrap
 *
 * Usage:
 *   node scripts/audit-bootstrap-readiness.mjs
 *   node scripts/audit-bootstrap-readiness.mjs --json
 *   node scripts/audit-bootstrap-readiness.mjs --strict    # exit 1 if verdict != pass
 *   node scripts/audit-bootstrap-readiness.mjs --repo <dir>
 *   node scripts/audit-bootstrap-readiness.mjs --partner-mode   # simulate COS_DESIGN_PARTNER_MODE=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.join(__dirname, '..');

/** Verdict ordering: higher index = worse */
const VERDICT_ORDER = [
  'pass',
  'pass_with_manual_gates',
  'fail_drift',
  'fail_missing_prereq',
  'fail_unsafe_mode',
];

function worse(a, b) {
  return VERDICT_ORDER.indexOf(a) >= VERDICT_ORDER.indexOf(b) ? a : b;
}

export function parseArgs(argv) {
  const out = { json: false, strict: false, repo: DEFAULT_REPO, partnerMode: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--repo') out.repo = String(argv[++i] || DEFAULT_REPO);
    else if (a === '--partner-mode') out.partnerMode = true;
    else if (a === '--no-partner-mode') out.partnerMode = false;
  }
  return out;
}

function readJson(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} kind one of D1..D5
 * @param {string} verdict contribution (pass / pass_with_manual_gates / fail_drift / fail_missing_prereq / fail_unsafe_mode)
 * @param {string} message human-readable
 * @param {object} [extra]
 */
function mkFinding(kind, verdict, message, extra = {}) {
  return { check: kind, verdict, message, ...extra };
}

function envAsBool(env, key) {
  return String(env[key] || '').trim() === '1';
}

// ---------------------- D1 Repo / dependency integrity ----------------------

function checkDependencyIntegrity(repoRoot, findings) {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    findings.push(mkFinding('D1', 'fail_missing_prereq', 'package.json missing'));
    return;
  }
  const pkg = readJson(pkgPath);
  if (!pkg) {
    findings.push(mkFinding('D1', 'fail_drift', 'package.json unparsable'));
    return;
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  // Required packages for currently implemented live surface lanes (W13-A)
  const REQUIRED_FOR_LIVE = ['libsodium-wrappers', '@slack/bolt', '@supabase/supabase-js', 'openai'];
  for (const r of REQUIRED_FOR_LIVE) {
    if (!deps[r]) {
      findings.push(
        mkFinding('D1', 'fail_missing_prereq', `Required dependency missing in package.json: ${r}`, {
          dependency: r,
        }),
      );
    }
  }

  // Check scripts referenced in package.json actually exist on disk.
  const nodeInvocationRe = /node\s+(scripts\/[^\s&]+)/g;
  const scripts = pkg.scripts || {};
  for (const name of Object.keys(scripts)) {
    const cmd = String(scripts[name] || '');
    for (const match of cmd.matchAll(nodeInvocationRe)) {
      const rel = match[1];
      if (!rel.startsWith('scripts/')) continue;
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        findings.push(
          mkFinding('D1', 'fail_drift', `Script referenced by package.json missing: ${rel}`, {
            script: name,
            path: rel,
          }),
        );
      }
    }
  }
}

// ---------------------- D2 Environment completeness ----------------------

function checkEnvCompleteness(env, findings) {
  // Core required regardless of mode (mirrors app.js REQUIRED).
  const CORE = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN', 'OPENAI_API_KEY'];
  for (const k of CORE) {
    if (!String(env[k] || '').trim()) {
      findings.push(
        mkFinding('D2', 'fail_missing_prereq', `Required env missing: ${k}`, { env_key: k }),
      );
    }
  }

  // Live-writer flags — if enabled, require provider tokens.
  if (envAsBool(env, 'COS_LIVE_BINDING_WRITERS')) {
    const providerRequirements = [
      { provider: 'github', keys: ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'] },
      { provider: 'vercel', keys: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'] },
    ];
    // Only flag if partner has *enabled* live writers; we ask for the tokens for
    // the surfaces that are actually write-capable (GitHub + Vercel in W13-A).
    for (const p of providerRequirements) {
      for (const k of p.keys) {
        if (!String(env[k] || '').trim()) {
          findings.push(
            mkFinding(
              'D2',
              'fail_missing_prereq',
              `COS_LIVE_BINDING_WRITERS=1 but ${p.provider} required env missing: ${k}`,
              { provider: p.provider, env_key: k },
            ),
          );
        }
      }
    }
  }
}

// ---------------------- D3 Runtime / DB prerequisites ----------------------

function checkRuntimePrereqs(repoRoot, env, partnerMode, findings) {
  const migrationDir = path.join(repoRoot, 'supabase', 'migrations');
  if (!fs.existsSync(migrationDir)) {
    findings.push(
      mkFinding('D3', 'fail_missing_prereq', 'supabase/migrations directory missing'),
    );
  } else {
    const migs = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
    // Require at least the project_space_binding_graph baseline migration.
    const requiredSubstrings = ['project_space_binding_graph', 'binding_propagation_and_continuation'];
    for (const needle of requiredSubstrings) {
      if (!migs.some((m) => m.includes(needle))) {
        findings.push(
          mkFinding('D3', 'fail_missing_prereq', `Required migration missing: *${needle}*.sql`, {
            needle,
          }),
        );
      }
    }
  }

  // Partner mode + unsafe runtime mode is a hard fail_unsafe_mode.
  const runStore = String(env.COS_RUN_STORE || '').trim().toLowerCase();
  if (partnerMode && runStore === 'memory') {
    findings.push(
      mkFinding(
        'D3',
        'fail_unsafe_mode',
        'COS_DESIGN_PARTNER_MODE=1 with COS_RUN_STORE=memory is unsafe for a dedicated install.',
        { env_key: 'COS_RUN_STORE', observed: 'memory' },
      ),
    );
  }
  if (partnerMode && !runStore) {
    findings.push(
      mkFinding(
        'D3',
        'fail_missing_prereq',
        'COS_DESIGN_PARTNER_MODE=1 but COS_RUN_STORE is not set; partner install must pick a durable mode (supabase recommended).',
        { env_key: 'COS_RUN_STORE' },
      ),
    );
  }
}

// ---------------------- D4 Slack app / packaging prerequisites ----------------------

function checkPackaging(repoRoot, findings) {
  const REQUIRED = [
    'docs/design-partner-beta/SLACK_APP_MANIFEST.reference.json',
    'docs/design-partner-beta/INSTALL_NOTES.md',
    'docs/design-partner-beta/BYO_KEYS_INFRA_STANCE.md',
    'docs/design-partner-beta/OPERATOR_SMOKE_TEST_CHECKLIST.md',
    'docs/design-partner-beta/KNOWN_HUMAN_GATE_POINTS.md',
  ];
  for (const rel of REQUIRED) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      findings.push(
        mkFinding('D4', 'fail_missing_prereq', `Packaging doc missing: ${rel}`, { path: rel }),
      );
    }
  }
  // Known human gate doc existence → always at least pass_with_manual_gates (human-gate path is by design).
  findings.push(
    mkFinding('D4', 'pass_with_manual_gates', 'Known human-gate points documented; manual gates remain by design.', {
      note: 'design-partner-beta/KNOWN_HUMAN_GATE_POINTS.md',
    }),
  );
}

// ---------------------- D5 Provider capability / readiness coherence ----------------------

function checkCapabilityCoherence(repoRoot, env, findings) {
  const ledgerPath = path.join(repoRoot, 'ops', 'live_binding_capability_qualifications.json');
  const registryPath = path.join(repoRoot, 'src', 'founder', 'liveBindingCapabilityRegistry.js');
  if (!fs.existsSync(registryPath)) {
    findings.push(mkFinding('D5', 'fail_missing_prereq', 'liveBindingCapabilityRegistry.js missing'));
    return;
  }
  if (!fs.existsSync(ledgerPath)) {
    findings.push(
      mkFinding(
        'D5',
        'pass_with_manual_gates',
        'No qualification ledger yet — no sink is claimed live_verified (honest default).',
        { path: path.relative(repoRoot, ledgerPath) },
      ),
    );
    return;
  }
  const ledger = readJson(ledgerPath);
  if (!ledger || typeof ledger !== 'object') {
    findings.push(mkFinding('D5', 'fail_drift', 'Qualification ledger unparsable'));
    return;
  }
  const sinks = ledger.sinks || {};
  let liveClaimCount = 0;
  let liveVerifiedHasToken = false;
  for (const sinkName of Object.keys(sinks)) {
    const entry = sinks[sinkName] || {};
    if (entry.qualification_status === 'live_verified') {
      liveClaimCount += 1;
      // Check that enabling live writers for this sink would actually succeed token-wise.
      if (sinkName === 'github' && env.GITHUB_TOKEN) liveVerifiedHasToken = true;
      else if (sinkName === 'vercel' && env.VERCEL_TOKEN) liveVerifiedHasToken = true;
    }
  }
  if (
    liveClaimCount > 0 &&
    envAsBool(env, 'COS_LIVE_BINDING_WRITERS') &&
    !liveVerifiedHasToken
  ) {
    findings.push(
      mkFinding(
        'D5',
        'fail_drift',
        'Qualification ledger claims live_verified sink(s), but no corresponding provider token is set while live writers are enabled.',
        { live_verified_count: liveClaimCount },
      ),
    );
  }
}

// ---------------------- Runner ----------------------

export function runBootstrapAudit({ repoRoot, env, partnerModeExplicit }) {
  const envSnap = env || process.env;
  const partnerMode =
    typeof partnerModeExplicit === 'boolean'
      ? partnerModeExplicit
      : envAsBool(envSnap, 'COS_DESIGN_PARTNER_MODE');

  const findings = [];
  checkDependencyIntegrity(repoRoot, findings);
  checkEnvCompleteness(envSnap, findings);
  checkRuntimePrereqs(repoRoot, envSnap, partnerMode, findings);
  checkPackaging(repoRoot, findings);
  checkCapabilityCoherence(repoRoot, envSnap, findings);

  let verdict = 'pass';
  for (const f of findings) verdict = worse(verdict, f.verdict);

  return {
    schema_version: 1,
    repo_root: repoRoot,
    partner_mode: partnerMode,
    verdict,
    findings,
    counts: findings.reduce((acc, f) => {
      acc[f.verdict] = (acc[f.verdict] || 0) + 1;
      return acc;
    }, {}),
  };
}

// CLI
const invokedDirectly = (() => {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const args = parseArgs(process.argv);
  const envSnap = { ...process.env };
  if (args.partnerMode === true) envSnap.COS_DESIGN_PARTNER_MODE = '1';
  if (args.partnerMode === false) delete envSnap.COS_DESIGN_PARTNER_MODE;
  const report = runBootstrapAudit({
    repoRoot: args.repo,
    env: envSnap,
    partnerModeExplicit: args.partnerMode,
  });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[audit-bootstrap-readiness] verdict=${report.verdict} partner_mode=${report.partner_mode}`,
    );
    for (const f of report.findings) {
      console.log(` - [${f.check}] ${f.verdict}\t${f.message}`);
    }
  }
  if (args.strict && report.verdict !== 'pass') process.exit(1);
}
