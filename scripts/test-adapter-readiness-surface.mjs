import assert from 'node:assert';
import {
  getAdapterReadiness,
  getAllAdapterReadiness,
  formatAdapterReadinessOneLine,
} from '../src/founder/toolsBridge.js';

async function ghEmpty() {
  const r = await getAdapterReadiness('github', {});
  assert.equal(r.tool, 'github');
  assert.equal(r.declared, false);
  assert.equal(r.configured, false);
  assert.equal(r.live_capable, false);
  assert.ok(r.missing.some((m) => m.includes('GITHUB_TOKEN') && m.includes('FINE_GRAINED')));
  assert.ok(r.missing.some((m) => m.includes('GITHUB_REPOSITORY') && m.includes('DEFAULT')));
}

/** GITHUB_TOKEN + GITHUB_REPOSITORY — live-ready */
async function ghCanonicalTokenAndRepo() {
  const r = await getAdapterReadiness('github', {
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'acme/yo',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, true);
  assert.equal(r.details.repo_parse_ok, true);
  assert.equal(r.details.github_token_source, 'GITHUB_TOKEN');
  assert.equal(r.details.github_repository_source, 'GITHUB_REPOSITORY');
  assert.equal(r.details.effective_repository, 'acme/yo');
  const line = formatAdapterReadinessOneLine(r);
  assert.ok(!line.includes('[GITHUB_TOKEN+GITHUB_REPOSITORY]'), line);
}

/** GITHUB_FINE_GRAINED_PAT + DEFAULT_OWNER/REPO — 동일하게 live-ready */
async function ghAliasPatAndDefaults() {
  const r = await getAdapterReadiness('github', {
    GITHUB_FINE_GRAINED_PAT: 'pat',
    GITHUB_DEFAULT_OWNER: 'G1ART',
    GITHUB_DEFAULT_REPO: 'slack_cos',
  });
  assert.equal(r.live_capable, true);
  assert.equal(r.details.github_token_source, 'GITHUB_FINE_GRAINED_PAT');
  assert.equal(r.details.github_repository_source, 'GITHUB_DEFAULT_OWNER_REPO');
  assert.equal(r.details.effective_repository, 'G1ART/slack_cos');
  const line = formatAdapterReadinessOneLine(r);
  assert.ok(line.includes('[GITHUB_FINE_GRAINED_PAT+GITHUB_DEFAULT_OWNER_REPO]'), line);
}

async function ghPrecedenceCanonicalOverAlias() {
  const r = await getAdapterReadiness('github', {
    GITHUB_TOKEN: 'aa',
    GITHUB_FINE_GRAINED_PAT: 'bb',
    GITHUB_REPOSITORY: 'x/y',
    GITHUB_DEFAULT_OWNER: 'o',
    GITHUB_DEFAULT_REPO: 'r',
  });
  assert.equal(r.live_capable, true);
  assert.equal(r.details.github_token_source, 'GITHUB_TOKEN');
  assert.equal(r.details.github_repository_source, 'GITHUB_REPOSITORY');
  assert.equal(r.details.effective_repository, 'x/y');
}

async function ghBadRepo() {
  const r = await getAdapterReadiness('github', {
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'nope',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, false);
  assert.equal(r.live_capable, false);
  assert.ok(r.missing.some((x) => x.includes('parse')));
}

async function supaMissing() {
  const r = await getAdapterReadiness('supabase', {});
  assert.equal(r.live_capable, false);
  assert.ok(r.missing.includes('SUPABASE_URL') || r.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
}

async function supaConfigured() {
  const r = await getAdapterReadiness('supabase', {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sr',
  });
  assert.equal(r.live_capable, true);
}

async function cursorNoCli() {
  const r = await getAdapterReadiness('cursor', {
    CURSOR_CLI_BIN: '/this/path/does/not/exist/cursor-cli-xyz',
    CURSOR_PROJECT_DIR: process.cwd(),
  });
  assert.equal(r.live_capable, false);
  assert.ok(r.reason.includes('CLI') || r.reason.includes('artifact'));
}

async function railwayTokenOnly() {
  const r = await getAdapterReadiness('railway', { RAILWAY_TOKEN: 'tok' });
  assert.equal(r.details.inspect_logs_live_capable, false);
  assert.equal(r.details.deploy_live, false);
  assert.ok(r.missing.includes('deployment_id'));
}

async function railwayTokenDep() {
  const r = await getAdapterReadiness('railway', {
    RAILWAY_TOKEN: 'tok',
    RAILWAY_DEPLOYMENT_ID: 'dep1',
  });
  assert.equal(r.details.inspect_logs_live_capable, true);
  assert.equal(r.details.deploy_live, false);
}

async function allLines() {
  const all = await getAllAdapterReadiness({
    GITHUB_TOKEN: '',
    GITHUB_FINE_GRAINED_PAT: '',
    SUPABASE_URL: '',
    CURSOR_CLI_BIN: '/nope',
    RAILWAY_TOKEN: '',
  });
  assert.equal(all.length, 5);
  for (const x of all) {
    const line = formatAdapterReadinessOneLine(x);
    assert.ok(line.includes(`${x.tool}:`), line);
  }
}

await ghEmpty();
await ghCanonicalTokenAndRepo();
await ghAliasPatAndDefaults();
await ghPrecedenceCanonicalOverAlias();
await ghBadRepo();
await supaMissing();
await supaConfigured();
await cursorNoCli();
await railwayTokenOnly();
await railwayTokenDep();
await allLines();

console.log('test-adapter-readiness-surface: ok');
