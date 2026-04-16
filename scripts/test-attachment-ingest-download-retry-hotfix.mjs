/**
 * 이벤트 URL로 401/403 후 `files.info` 1회로 URL 갱신·재다운로드 (루프 없음).
 */
import assert from 'node:assert/strict';
import { ingestCurrentTurnAttachments } from '../src/founder/ingestAttachments.js';

const onePxPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let filesInfoCalls = 0;
const client = {
  token: 'x-test',
  files: {
    info: async ({ file }) => {
      filesInfoCalls += 1;
      assert.equal(file, 'Fretry');
      return {
        file: {
          id: 'Fretry',
          name: 'refreshed.png',
          mimetype: 'image/png',
          url_private_download: 'https://files.slack.com/private/refreshed.png',
        },
      };
    },
  },
};

const prevFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  const u = String(url);
  if (u.includes('stale-private')) {
    return new Response('', { status: 403, statusText: 'Forbidden' });
  }
  return new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });
};

const openai = {
  chat: {
    completions: {
      create: async () => ({ choices: [{ message: { content: 'retry 후 요약' } }] }),
    },
  },
};

try {
  const results = await ingestCurrentTurnAttachments({
    client,
    openai,
    model: 'gpt-4o',
    files: [
      {
        id: 'Fretry',
        name: 'x.png',
        mimetype: 'image/png',
        url_private_download: 'https://files.slack.com/private/stale-private/x.png',
      },
    ],
  });
  assert.equal(filesInfoCalls, 1, '401/403 시 files.info 한 번만');
  assert.equal(fetchCalls, 2, '첫 실패 + 갱신 URL로 재시도');
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].summary, 'retry 후 요약');
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-ingest-download-retry-hotfix: ok');
