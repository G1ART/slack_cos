/**
 * Slack 첨부 핫픽스: 이벤트 `files[]`에 URL·메타가 있으면 `files.info` 없이 ingest.
 */
import assert from 'node:assert/strict';
import {
  ingestCurrentTurnAttachments,
  needsSlackFileInfoLookup,
} from '../src/founder/ingestAttachments.js';

const onePxPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

assert.equal(
  needsSlackFileInfoLookup({
    id: 'F1',
    name: 'shot.png',
    mimetype: 'image/png',
    url_private_download: 'https://files.slack.com/private/shot.png',
  }),
  false,
);

let filesInfoCalls = 0;
const client = {
  token: 'x-test',
  files: {
    info: async () => {
      filesInfoCalls += 1;
      throw new Error('files.info must not be called on event-payload path');
    },
  },
};

const prevFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });

const openai = {
  chat: {
    completions: {
      create: async () => ({ choices: [{ message: { content: '한 단락 요약' } }] }),
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
        id: 'F123',
        name: 'shot.png',
        mimetype: 'image/png',
        url_private_download: 'https://files.slack.com/private/shot.png',
      },
    ],
  });
  assert.equal(filesInfoCalls, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].summary, '한 단락 요약');
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-ingest-event-payload-direct-hotfix: ok');
