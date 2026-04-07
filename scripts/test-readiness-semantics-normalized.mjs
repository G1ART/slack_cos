import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapterReadiness } from '../src/founder/toolsBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub partial: token only
{
  const r = await getAdapterReadiness('github', { GITHUB_TOKEN: 't' });
  assert.equal(r.declared, true);
  assert.equal(r.configured, false);
  assert.equal(r.live_capable, false);
}

// GitHub full alias env
{
  const r = await getAdapterReadiness('github', {
    GITHUB_FINE_GRAINED_PAT: 'pat',
    GITHUB_DEFAULT_OWNER: 'O',
    GITHUB_DEFAULT_REPO: 'R',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, true);
}

// Supabase partial: URL only
{
  const r = await getAdapterReadiness('supabase', {
    SUPABASE_URL: 'https://x.supabase.co',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, false);
  assert.equal(r.live_capable, false);
}

// Supabase full env
{
  const r = await getAdapterReadiness('supabase', {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, true);
}

// Cursor: declared (bin set) but invalid cwd
{
  const r = await getAdapterReadiness('cursor', {
    CURSOR_CLI_BIN: '/nonexistent/cursor-bin-xyz-999',
    CURSOR_PROJECT_DIR: path.join(__dirname, '..', '.runtime', 'no-such-cursor-dir-99999'),
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, false);
  assert.equal(r.live_capable, false);
}

// Cursor: valid CLI + cwd
{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cos-rdy-'));
  const okScript = path.join(tmp, 'agent-ok.sh');
  await fs.writeFile(okScript, '#!/bin/sh\necho ok\nexit 0\n', 'utf8');
  await fs.chmod(okScript, 0o755);
  const r = await getAdapterReadiness('cursor', {
    CURSOR_CLI_BIN: okScript,
    CURSOR_PROJECT_DIR: tmp,
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, true);
  await fs.rm(tmp, { recursive: true, force: true });
}

// Railway token only
{
  const r = await getAdapterReadiness('railway', { RAILWAY_TOKEN: 'tok' });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, false);
}

// Railway token + deployment_id
{
  const r = await getAdapterReadiness('railway', {
    RAILWAY_TOKEN: 'tok',
    RAILWAY_DEPLOYMENT_ID: 'dep',
  });
  assert.equal(r.declared, true);
  assert.equal(r.configured, true);
  assert.equal(r.live_capable, true);
}

console.log('test-readiness-semantics-normalized: ok');
