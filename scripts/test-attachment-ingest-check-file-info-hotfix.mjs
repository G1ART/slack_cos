/**
 * Slack Connect `check_file_info`: `files.info` 한 번으로 메타 보강 후 ingest.
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
      assert.equal(file, 'F9');
      return {
        file: {
          id: 'F9',
          name: 'from-info.png',
          mimetype: 'image/png',
          url_private_download: 'https://files.slack.com/private/from-info.png',
        },
      };
    },
  },
};

const prevFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });

const openai = {
  chat: {
    completions: {
      create: async () => ({ choices: [{ message: { content: 'connect 경로 요약' } }] }),
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
        id: 'F9',
        file_access: 'check_file_info',
        name: 'placeholder.png',
      },
    ],
  });
  assert.equal(filesInfoCalls, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].summary, 'connect 경로 요약');
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-ingest-check-file-info-hotfix: ok');
