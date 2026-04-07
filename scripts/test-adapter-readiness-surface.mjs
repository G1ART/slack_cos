import assert from 'node:assert';
import {
  getAdapterReadiness,
  getAllAdapterReadiness,
  formatAdapterReadinessOneLine,
} from '../src/founder/toolsBridge.js';

async function ghEmpty() {
  const r = await getAdapterReadiness('github', {});
  assert.equal(r.tool, 'github');
  assert.equal(r.live_capable, false);
  assert.ok(r.missing.includes('GITHUB_TOKEN'));
  assert.ok(r.missing.includes('GITHUB_REPOSITORY'));
}

async function ghConfigured() {
  const r = await getAdapterReadiness('github', {
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'acme/yo',
  });
  assert.equal(r.live_capable, true);
  assert.equal(r.details.repo_parse_ok, true);
}

async function ghBadRepo() {
  const r = await getAdapterReadiness('github', {
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'nope',
  });
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
await ghConfigured();
await ghBadRepo();
await supaMissing();
await supaConfigured();
await cursorNoCli();
await railwayTokenOnly();
await railwayTokenDep();
await allLines();

console.log('test-adapter-readiness-surface: ok');
