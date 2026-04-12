/**
 * 슈퍼바이저 tick 재진입 키: run·thread 샤딩 (전역 단일 직렬화 아님).
 */
import assert from 'node:assert';
import {
  supervisorTickInflightKeyForRun,
  supervisorTickInflightKeyForThread,
} from '../src/founder/supervisorTickSharding.js';

assert.equal(supervisorTickInflightKeyForRun('uuid-1'), 'r:uuid-1');
assert.equal(supervisorTickInflightKeyForRun(''), 'r:');
assert.equal(supervisorTickInflightKeyForThread('mention:thread:a'), 't:mention:thread:a');

console.log('test-run-supervisor-parcel-sharding: ok');
