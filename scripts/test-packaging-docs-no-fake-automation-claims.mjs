/**
 * W12-E — packaging 4 문서에 “fully automatic / no human needed / 100% hands-off /
 * zero-touch / turnkey / autonomous deployment / fully autonomous” 같은 과장 문구가 없다.
 *
 * 부정문 (예: “turnkey SaaS 아님”, “완전 자동을 약속하지 않는다”) 는 허용해야 하므로
 * 가장 단순한 형태로 금지 문구 자체가 등장하지 않는지만 확인한다(부정문조차 쓰지 않도록).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const beta = path.resolve(process.cwd(), 'docs/design-partner-beta');
const docs = [
  'INSTALL_NOTES.md',
  'BYO_KEYS_INFRA_STANCE.md',
  'OPERATOR_SMOKE_TEST_CHECKLIST.md',
  'KNOWN_HUMAN_GATE_POINTS.md',
];

const forbidden = [
  /fully\s+automatic/i,
  /fully\s+autonomous/i,
  /no\s+human\s+needed/i,
  /100\s*%\s*hands[-\s]?off/i,
  /zero[-\s]?touch/i,
  /turn[-\s]?key\s+saas/i,
];

for (const name of docs) {
  const p = path.join(beta, name);
  assert.ok(fs.existsSync(p), `missing doc: ${name}`);
  const txt = fs.readFileSync(p, 'utf8');
  for (const pat of forbidden) {
    assert.equal(pat.test(txt), false, `doc ${name} contains forbidden claim ${pat}`);
  }
  assert.ok(txt.length > 200, `doc ${name} is suspiciously short`);
}

console.log('test-packaging-docs-no-fake-automation-claims: ok');
