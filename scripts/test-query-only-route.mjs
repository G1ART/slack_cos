/**
 * Query-only route: parser + 금지 Council 푸터 문구 미포함 스모크
 */
import assert from 'assert';
import { parseCommandToken, handleQueryOnlyCommands } from '../src/features/queryOnlyRoute.js';

const FORBIDDEN = [
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장',
  '미해결 충돌',
  '핵심 리스크',
  '대표 결정 필요 여부',
  '실행 작업 후보로 보입니다',
];

assert.strictEqual(parseCommandToken('계획진행 PLN-1', '계획진행'), 'PLN-1');
assert.strictEqual(parseCommandToken('계획진행', '계획진행'), null);
assert.strictEqual(parseCommandToken('업무상세 WRK-260320-08', '업무상세'), 'WRK-260320-08');

const usage = await handleQueryOnlyCommands('계획진행');
assert.ok(usage.includes('형식'), 'usage for 계획진행 without id');
for (const f of FORBIDDEN) {
  assert.ok(!usage.includes(f), `usage must not contain: ${f}`);
}

const usage2 = await handleQueryOnlyCommands('계획상세');
assert.ok(usage2.includes('형식'));

const nf = await handleQueryOnlyCommands('계획상세 PLN-DOES-NOT-EXIST-XYZ');
assert.ok(nf.includes('찾지 못했습니다'), 'not found');
for (const f of FORBIDDEN) {
  assert.ok(!nf.includes(f), `not_found must not contain: ${f}`);
}

console.log('ok: query_only_route_smoke');
