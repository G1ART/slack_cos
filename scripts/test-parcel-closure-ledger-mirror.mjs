/**
 * 택배: authoritative closure 시 ledger에 completed tool_result mirror append (COS 가시성).
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendCloudEmitPatchClosureLedgerMirror,
  clearExecutionArtifacts,
  readExecutionSummary,
} from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-parcel-closure-mirror');

const tk = 'mention:test_channel:closure_mirror_ts';

await clearExecutionArtifacts(tk);
await appendCloudEmitPatchClosureLedgerMirror(tk);
const lines = await readExecutionSummary(tk, 20);
assert.ok(
  lines.some((l) => String(l).includes('completed') && String(l).includes('cursor:emit_patch')),
  lines.join('\n'),
);

await clearExecutionArtifacts(tk);

console.log('test-parcel-closure-ledger-mirror: ok');
