#!/usr/bin/env node
/**
 * `/g1cos` 와 동일한 본문이 `tryFinalizeSlackQueryRoute` 에서 처리되는지 스모크.
 * (Bolt/Slack 네트워크 없음)
 */
import { ensureStorage } from '../src/storage/jsonStore.js';
import { normalizeSlackUserPayload } from '../src/slack/slackTextNormalize.js';
import { tryFinalizeSlackQueryRoute } from '../src/features/queryOnlyRoute.js';
import { inboundPayloadPlainText } from '../src/slack/queryResponseBlocks.js';

await ensureStorage();

const cases = [
  ['계획상세 PLN-SLASH-SMOKE-NOT-REAL', 'finalized'],
  ['계획진행', 'usage'],
  ['업무상세 WRK-SLASH-SMOKE-NOT-REAL', 'finalized'],
];

let ok = true;
for (const [line, kind] of cases) {
  const trimmed = normalizeSlackUserPayload(line);
  const raw = `/g1cos ${line}`;
  const out = await tryFinalizeSlackQueryRoute(trimmed, {
    raw_text: raw,
    normalized_text: trimmed,
  });
  const hit = out != null;
  const outPlain = inboundPayloadPlainText(out);
  if (kind === 'usage') {
    if (!hit || !outPlain.includes('형식')) {
      console.error('FAIL usage expected usage_error-ish:', line, outPlain.slice(0, 80));
      ok = false;
    } else {
      console.log('ok: usage', line);
    }
  } else {
    if (!hit) {
      console.error('FAIL expected query finalize:', line);
      ok = false;
    } else {
      console.log('ok: finalized', line.slice(0, 40));
    }
  }
}

const plain = normalizeSlackUserPayload('그냥 인사');
const noQuery = await tryFinalizeSlackQueryRoute(plain, {
  raw_text: `/g1cos ${plain}`,
  normalized_text: plain,
});
if (noQuery != null) {
  console.error('FAIL non-query should miss tryFinalize');
  ok = false;
} else {
  console.log('ok: non-query miss');
}

if (!ok) process.exit(1);
console.log('All /g1cos routing smokes passed.');
