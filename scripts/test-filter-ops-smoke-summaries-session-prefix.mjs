import assert from 'node:assert';
import { filterOpsSmokeSummariesBySessionIdPrefix } from '../src/founder/smokeOps.js';

const sums = [
  { smoke_session_id: 'g1_smoke_1_abcd' },
  { smoke_session_id: 'other_smoke_1_abcd' },
];
assert.equal(filterOpsSmokeSummariesBySessionIdPrefix(sums, '').length, 2);
assert.equal(filterOpsSmokeSummariesBySessionIdPrefix(sums, 'g1_').length, 1);
assert.equal(filterOpsSmokeSummariesBySessionIdPrefix(sums, '  g1_  ')[0].smoke_session_id, 'g1_smoke_1_abcd');

console.log('test-filter-ops-smoke-summaries-session-prefix: ok');
