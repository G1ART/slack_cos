import assert from 'node:assert';
import { sendFounderResponse, findForbiddenInText } from '../src/founder/sendFounderResponse.js';

const forbidden = ['한 줄 요약', '종합 추천안', 'strategy_finance', '업무등록'];

assert.equal(findForbiddenInText('정상 답변입니다.', forbidden), null);
assert.equal(findForbiddenInText('여기 한 줄 요약', forbidden), '한 줄 요약');

let threw = false;
try {
  await sendFounderResponse({
    say: async () => {
      assert.fail('say must not run when forbidden');
    },
    text: '종합 추천안을 제시합니다.',
    constitutionSha256: 'deadbeef',
    forbiddenPhrases: forbidden,
  });
} catch (e) {
  threw = true;
  assert.equal(e.code, 'founder_forbidden_substring');
}
assert.ok(threw, 'must throw on forbidden substring');

console.log('test-founder-forbidden-output: ok');
