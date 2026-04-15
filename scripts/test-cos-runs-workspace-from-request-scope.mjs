/**
 * COS_WORKSPACE_KEY 미설정 시 cos_runs 매핑·applyCosRunTenancyDefaults 가 요청 스코프의 Slack team 으로 workspace_key 를 채운다.
 */
import assert from 'node:assert/strict';
import {
  COS_WORKSPACE_KEY_ENV,
  applyCosRunTenancyDefaults,
  workspaceKeyFromRequestScopeFallback,
} from '../src/founder/parcelDeploymentContext.js';
import { runWithRequestScope } from '../src/founder/requestScopeContext.js';
import { appRunToDbRow } from '../src/founder/runStoreSupabase.js';

const saved = process.env[COS_WORKSPACE_KEY_ENV];

function restore() {
  if (saved === undefined) delete process.env[COS_WORKSPACE_KEY_ENV];
  else process.env[COS_WORKSPACE_KEY_ENV] = saved;
}

async function main() {
  try {
    delete process.env[COS_WORKSPACE_KEY_ENV];

    await runWithRequestScope({ slack_team_id: 'T12345' }, async () => {
      assert.equal(workspaceKeyFromRequestScopeFallback(), 'T12345');
      const row = {};
      applyCosRunTenancyDefaults(row);
      assert.equal(row.workspace_key, 'T12345');
      const db = appRunToDbRow({
        thread_key: 't',
        dispatch_id: 'd',
        objective: 'o',
        status: 'running',
        harness_snapshot: {},
      });
      assert.equal(db.workspace_key, 'T12345');
    });

    process.env[COS_WORKSPACE_KEY_ENV] = 'env_ws';
    await runWithRequestScope({ slack_team_id: 'T99999' }, async () => {
      assert.equal(workspaceKeyFromRequestScopeFallback(), '');
      const row2 = {};
      applyCosRunTenancyDefaults(row2);
      assert.equal(row2.workspace_key, 'env_ws');
      const db2 = appRunToDbRow({
        thread_key: 't2',
        dispatch_id: 'd2',
        objective: 'o',
        status: 'running',
        harness_snapshot: {},
      });
      assert.equal(db2.workspace_key, 'env_ws');
    });
  } finally {
    restore();
  }

  console.log('test-cos-runs-workspace-from-request-scope: ok');
}

main();
