/**
 * 병합 스모크 요약: 테이블별 fetch 상한이 최종 slice보다 넉넉한지 (슬랙 없이 검증).
 */
import assert from 'node:assert';
import { mergedSmokeSummaryPerSourceFetchBudget } from '../src/founder/runStoreSupabase.js';

assert.equal(mergedSmokeSummaryPerSourceFetchBudget(2000), 4000);
assert.equal(mergedSmokeSummaryPerSourceFetchBudget(1), 2);
assert.equal(mergedSmokeSummaryPerSourceFetchBudget(10000), 10000);

console.log('test-merged-smoke-summary-source-budget: ok');
