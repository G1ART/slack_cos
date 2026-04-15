/**
 * mergeLedgerExecutionRowPayload — thread ledger·durable 이벤트와 동일 SSOT 병합 회귀.
 */
import assert from 'node:assert';
import { mergeLedgerExecutionRowPayload } from '../src/founder/canonicalExecutionEnvelope.js';

const prev = process.env.COS_PRODUCT_KEY;
process.env.COS_PRODUCT_KEY = 'ledger_merge_prod';

const o = mergeLedgerExecutionRowPayload(
  { internal: 'x' },
  { threadKey: 'dm:merge-test', runId: '00000000-0000-4000-8000-000000000001' },
  process.env,
);

assert.equal(String(o.thread_key || ''), 'dm:merge-test');
assert.equal(String(o.run_id || ''), '00000000-0000-4000-8000-000000000001');
assert.equal(String(o.product_key || ''), 'ledger_merge_prod');
assert.equal(o.internal, 'x');

if (prev === undefined) delete process.env.COS_PRODUCT_KEY;
else process.env.COS_PRODUCT_KEY = prev;

console.log('test-merge-ledger-execution-row-payload: ok');
