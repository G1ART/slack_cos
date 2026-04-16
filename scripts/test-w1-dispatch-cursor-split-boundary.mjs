/**
 * W1 remaining closeout: generic dispatch stays thin vs Cursor lane runtime file.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dispatch = fs.readFileSync(
  path.join(root, 'src/founder/toolPlane/dispatchExternalToolCall.js'),
  'utf8',
);
const flow = fs.readFileSync(
  path.join(root, 'src/founder/toolPlane/externalToolInvocationFlow.js'),
  'utf8',
);
const cursorPath = fs.readFileSync(
  path.join(root, 'src/founder/toolPlane/lanes/cursor/cursorCloudAutomationPath.js'),
  'utf8',
);

const dispatchLines = dispatch.split(/\r?\n/).length;
const flowLines = flow.split(/\r?\n/).length;
const cursorLines = cursorPath.split(/\r?\n/).length;

assert.ok(dispatchLines < 40, `dispatchExternalToolCall.js expected thin (<40 lines), got ${dispatchLines}`);
assert.ok(flowLines > 200, `externalToolInvocationFlow.js expected body (>200 lines), got ${flowLines}`);
assert.ok(cursorLines > 400, `cursorCloudAutomationPath.js expected >400 lines, got ${cursorLines}`);

assert.ok(
  !dispatch.includes('isCursorCloudAgentLaneReady'),
  'thin dispatch must not import Cursor lane readiness',
);
assert.ok(
  !dispatch.includes('prepareEmitPatchPayloadWithDelegate'),
  'thin dispatch must not import delegate merge',
);
assert.ok(
  !dispatch.includes('runCursorCloudAutomationExecutionBranch'),
  'thin dispatch must not import automation branch',
);
assert.ok(flow.includes('runCursorCloudAutomationExecutionBranch'), 'flow wires automation branch');
assert.ok(flow.includes('isCursorCloudAgentLaneReady'), 'flow owns Cursor readiness gate');
assert.ok(!dispatch.includes('triggerCursorAutomation({'), 'generic dispatch must not embed Cursor HTTP trigger');
assert.ok(cursorPath.includes('runCursorCloudAutomationExecutionBranch'), 'cursor lane entry export present');
assert.ok(cursorPath.includes('bindCursorEmitPatchDispatchLedgerBeforeTrigger'), 'ledger bind lives in cursor lane');

console.log('test-w1-dispatch-cursor-split-boundary: ok');
