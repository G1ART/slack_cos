import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendFounderResponse } from '../src/core/founderOutbound.js';
import { extractForbiddenPhrasesFromConstitution } from '../src/founder/constitutionExtract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = fs.readFileSync(path.join(__dirname, '..', 'CONSTITUTION.md'), 'utf8');
const forbidden = extractForbiddenPhrasesFromConstitution(md);

let threw = false;
try {
  await sendFounderResponse({
    say: async () => {},
    thread_ts: '1',
    rendered_text: '이 답변에는 종합 추천안 섹션이 있습니다.',
    surface_type: 'partner_natural_surface',
    trace: {
      founder_surface_source: 'test',
      pipeline_version: 'vNext.13.16.constitution_only',
    },
    metadata: {
      founder_route: true,
      founder_surface_source: 'test',
      pipeline_version: 'vNext.13.16.constitution_only',
      egress_caller: 'test',
    },
    forbiddenSubstrings: forbidden,
  });
} catch (e) {
  threw = true;
  assert.equal(e.code, 'founder_constitution_egress_blocked');
}
assert.ok(threw, 'partner_natural output containing forbidden phrase must throw');

console.log('test-vnext16-6-forbidden-egress: ok');
