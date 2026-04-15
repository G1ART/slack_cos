/**
 * M6: COS_PARCEL_DEPLOYMENT_KEY 가 설정된 프로세스에서 supervisor·복구·스레드 스윕이
 * cos_runs 조회에 parcel_deployment_key eq 를 거는지 (같은 DB 멀티 배포 분리).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'src', 'founder', 'runStoreSupabase.js');
const src = fs.readFileSync(p, 'utf8');
assert.ok(src.includes('parcelDeploymentKeyFromEnv'), 'imports parcelDeploymentKeyFromEnv');
for (const fn of [
  'supabaseListNonTerminalRunIds',
  'supabaseListPendingSupervisorWakeRunIds',
  'supabaseListRunsWithRecoveryEnvelopePending',
  'supabaseListThreadKeys',
]) {
  const i = src.indexOf(`export async function ${fn}`);
  assert.ok(i >= 0, `missing ${fn}`);
  const slice = src.slice(i, i + 1200);
  assert.match(slice, /\.eq\(\s*['"]parcel_deployment_key['"]\s*,\s*dep\s*\)/, `${fn} applies parcel_deployment_key eq`);
}

const ex = path.join(__dirname, '..', 'src', 'founder', 'executionRunStore.js');
const exSrc = fs.readFileSync(ex, 'utf8');
assert.ok(
  exSrc.includes('durableRowMatchesParcelDeploymentEnv') && exSrc.includes('parcelDeploymentKeyFromEnv'),
  'executionRunStore filters durable rows by parcel deployment env',
);

console.log('test-cos-runs-supervisor-lists-parcel-deployment-filter: ok');
