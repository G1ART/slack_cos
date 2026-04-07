import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, __cursorExecFileForTests } from '../src/founder/toolsBridge.js';
import { clearExecutionArtifacts } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cursor-tool');

const tk = `dm:cur-${Date.now()}`;
await clearExecutionArtifacts(tk);

const prevBin = process.env.CURSOR_CLI_BIN;
const prevDir = process.env.CURSOR_PROJECT_DIR;
process.env.CURSOR_CLI_BIN = '/nonexistent/cursor-bin-xyz-123';
process.env.CURSOR_PROJECT_DIR = process.cwd();

const noCli = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 't' } },
  { threadKey: tk },
);
assert.equal(noCli.execution_mode, 'artifact');
assert.equal(noCli.status, 'completed');
assert.equal(noCli.outcome_code, 'artifact_prepared');
assert.equal(noCli.needs_review, false);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cos-cursor-'));
const okScript = path.join(tmp, 'agent-ok.sh');
await fs.writeFile(okScript, '#!/bin/sh\necho spec-out\nexit 0\n', 'utf8');
await fs.chmod(okScript, 0o755);

process.env.CURSOR_CLI_BIN = okScript;
process.env.CURSOR_PROJECT_DIR = tmp;

const liveOk = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 'myfeature' } },
  { threadKey: tk },
);
assert.equal(liveOk.execution_mode, 'live');
assert.equal(liveOk.status, 'completed');
assert.equal(liveOk.outcome_code, 'live_completed');
assert.equal(liveOk.needs_review, false);
assert.ok(String(liveOk.result_summary).includes('live'));

const badScript = path.join(tmp, 'agent-bad.sh');
await fs.writeFile(badScript, '#!/bin/sh\necho err >&2\nexit 7\n', 'utf8');
await fs.chmod(badScript, 0o755);
process.env.CURSOR_CLI_BIN = badScript;

const liveBad = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 'x' } },
  { threadKey: tk },
);
assert.equal(liveBad.execution_mode, 'artifact');
assert.equal(liveBad.status, 'degraded');
assert.equal(liveBad.outcome_code, 'degraded_from_live_failure');
assert.equal(liveBad.needs_review, true);
assert.ok(liveBad.result_summary.includes('degraded'));

process.env.CURSOR_CLI_BIN = okScript;
__cursorExecFileForTests.fn = async () => ({ stdout: 'mocked-stdout', stderr: '' });
const mocked = await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 'via-hook' } },
  { threadKey: tk },
);
__cursorExecFileForTests.fn = null;
assert.equal(mocked.execution_mode, 'live');
assert.equal(mocked.status, 'completed');
assert.equal(mocked.outcome_code, 'live_completed');
assert.ok(String(mocked.result_summary).includes('live'));

if (prevBin === undefined) delete process.env.CURSOR_CLI_BIN;
else process.env.CURSOR_CLI_BIN = prevBin;
if (prevDir === undefined) delete process.env.CURSOR_PROJECT_DIR;
else process.env.CURSOR_PROJECT_DIR = prevDir;

await fs.rm(tmp, { recursive: true, force: true });
await clearExecutionArtifacts(tk);

console.log('test-cursor-live-or-artifact: ok');
