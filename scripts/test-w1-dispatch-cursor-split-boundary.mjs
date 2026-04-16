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
const cursorPath = fs.readFileSync(
  path.join(root, 'src/founder/toolPlane/lanes/cursor/cursorCloudAutomationPath.js'),
  'utf8',
);

const dispatchLines = dispatch.split(/\r?\n/).length;
const cursorLines = cursorPath.split(/\r?\n/).length;

assert.ok(dispatchLines < 500, `dispatchExternalToolCall.js expected <500 lines, got ${dispatchLines}`);
assert.ok(cursorLines > 400, `cursorCloudAutomationPath.js expected >400 lines, got ${cursorLines}`);
assert.ok(!dispatch.includes('triggerCursorAutomation({'), 'generic dispatch must not embed Cursor HTTP trigger');
assert.ok(cursorPath.includes('runCursorCloudAutomationExecutionBranch'), 'cursor lane entry export present');
assert.ok(cursorPath.includes('bindCursorEmitPatchDispatchLedgerBeforeTrigger'), 'ledger bind lives in cursor lane');

console.log('test-w1-dispatch-cursor-split-boundary: ok');
