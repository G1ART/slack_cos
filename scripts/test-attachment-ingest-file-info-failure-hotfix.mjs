/**
 * 메타 조회 실패 시 구체적 사유·조기 종료 (파싱 단계로 가지 않음).
 */
import assert from 'node:assert/strict';
import { ingestCurrentTurnAttachments } from '../src/founder/ingestAttachments.js';

let filesInfoCalls = 0;
const client = {
  token: 'x-test',
  files: {
    info: async () => {
      filesInfoCalls += 1;
      const e = new Error('An API error occurred: missing_scope');
      /** @type {any} */ (e).data = { error: 'missing_scope' };
      throw e;
    },
  },
};

const prevFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return new Response('', { status: 500 });
};

try {
  const results = await ingestCurrentTurnAttachments({
    client,
    openai: /** @type {any} */ ({}),
    model: 'gpt-4o',
    files: [
      {
        id: 'F1',
        mimetype: 'image/png',
      },
    ],
  });
  assert.equal(filesInfoCalls, 1);
  assert.equal(fetchCalls, 0, 'files.info 실패 시 다운로드 시도 없음');
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.ok(
    String(results[0].reason || '').includes('Slack'),
    `reason should surface Slack lookup failure: ${results[0].reason}`,
  );
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-ingest-file-info-failure-hotfix: ok');
