/**
 * 이벤트 URL이 HTML이면 files.info로 URL 갱신 후 바이너리 다운로드(실사용 패턴).
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
      assert.equal(file, 'Fhtml');
      return {
        file: {
          id: 'Fhtml',
          name: 'real.png',
          mimetype: 'image/png',
          url_private_download: 'https://files.slack.com/files-pri/T-Fhtml/FRESH/real.png',
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
  if (u.includes('EVENT-HTML-ONLY')) {
    return new Response('<!DOCTYPE html><html><head></head><body>sign in</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  if (u.includes('/FRESH/')) {
    return new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });
  }
  throw new Error(`unexpected fetch url: ${u}`);
};

try {
  const results = await ingestCurrentTurnAttachments({
    client: /** @type {any} */ (client),
    openai: {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: '이미지 요약 완료' } }] }),
        },
      },
    },
    model: 'gpt-4o',
    files: [
      {
        id: 'Fhtml',
        name: 'image.png',
        mimetype: 'image/png',
        url_private_download: 'https://files.slack.com/files-pri/T-X/Fhtml/EVENT-HTML-ONLY/image.png',
      },
    ],
  });
  assert.equal(filesInfoCalls, 1, 'HTML 응답 후 files.info 1회');
  assert.ok(fetchCalls >= 2, '이벤트 URL + 갱신 URL');
  assert.equal(results[0].ok, true);
  assert.equal(results[0].summary, '이미지 요약 완료');
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-html-files-info-retry: ok');
