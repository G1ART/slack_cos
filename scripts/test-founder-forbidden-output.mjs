import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendFounderResponse } from '../src/founder/sendFounderResponse.js';
import {
  findForbiddenInText,
  parseForbiddenPhrasesFromConstitution,
} from './lib/forbiddenConstitutionTest.mjs';
import { buildSystemInstructions } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const constitutionPath = path.join(__dirname, '..', 'CONSTITUTION.md');
const constitutionMd = fs.readFileSync(constitutionPath, 'utf8');
const forbidden = parseForbiddenPhrasesFromConstitution(constitutionMd);

assert.ok(forbidden.length > 5, 'constitution-derived forbidden list non-trivial');

// 테스트 계층: 대표 문구·정규화 매칭 (런타임 sendFounderResponse 와 무관)
assert.equal(findForbiddenInText('정상 답변입니다.', forbidden), null);
assert.equal(findForbiddenInText('여기 한 줄 요약', forbidden), '한 줄 요약');
assert.equal(findForbiddenInText('한  줄   요약:', forbidden), '한 줄 요약');
assert.equal(findForbiddenInText('한줄요약', forbidden), '한 줄 요약');

// 런타임: 금지어가 있어도 송신 경로는 차단하지 않음 (pass-through)
let said = null;
const sendRes = await sendFounderResponse({
  say: async (payload) => {
    said = typeof payload === 'string' ? payload : payload?.text;
  },
  text: '종합 추천안을 제시합니다.',
  constitutionSha256: 'deadbeef',
});
assert.equal(sendRes.ok, true);
assert.equal(said, sendRes.text, 'runtime does not block forbidden substring');

// instruction에 헌법 전문이 포함되어 모델 측 규범 전달 (금지 목록은 헌법 본문에 명시됨)
const instr = buildSystemInstructions(constitutionMd);
assert.ok(instr.includes('--- 헌법 시작 ---'), 'model instruction embeds constitution');
assert.ok(instr.includes('## 6.1'), 'forbidden section present for model self-governance');

console.log('test-founder-forbidden-output: ok');
