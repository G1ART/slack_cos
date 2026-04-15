import assert from 'node:assert/strict';
import { mergeCanonicalExecutionEnvelopeToPayload } from '../src/founder/canonicalExecutionEnvelope.js';
import { runWithRequestScope } from '../src/founder/requestScopeContext.js';
import { COS_WORKSPACE_KEY_ENV } from '../src/founder/parcelDeploymentContext.js';

const savedWorkspace = process.env[COS_WORKSPACE_KEY_ENV];

try {
  delete process.env[COS_WORKSPACE_KEY_ENV];
  const a = await runWithRequestScope({ slack_team_id: 'T0SCOPE123' }, async () =>
    mergeCanonicalExecutionEnvelopeToPayload({ smoke_session_id: 's1' }, {}, process.env),
  );
  assert.equal(String(a.workspace_key || ''), 'T0SCOPE123');
  assert.equal(String(a.slack_team_id || ''), 'T0SCOPE123');

  process.env[COS_WORKSPACE_KEY_ENV] = 'ENV_WORKSPACE';
  const b = await runWithRequestScope({ slack_team_id: 'T0SCOPE999' }, async () =>
    mergeCanonicalExecutionEnvelopeToPayload({ smoke_session_id: 's2' }, {}, process.env),
  );
  assert.equal(String(b.workspace_key || ''), 'ENV_WORKSPACE', 'env workspace must take precedence');
  assert.equal(String(b.slack_team_id || ''), 'T0SCOPE999');

  console.log('test-canonical-envelope-workspace-from-scope: ok');
} finally {
  if (savedWorkspace === undefined) delete process.env[COS_WORKSPACE_KEY_ENV];
  else process.env[COS_WORKSPACE_KEY_ENV] = savedWorkspace;
}
