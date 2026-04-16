import assert from 'node:assert';
import { downloadPrivateUrl, ingestCurrentTurnAttachments } from '../src/founder/ingestAttachments.js';

const originalFetch = globalThis.fetch;

globalThis.fetch = async () => ({
  ok: true,
  url: 'https://files.slack.com/final',
  headers: {
    get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
  },
  arrayBuffer: async () =>
    new TextEncoder().encode('<!DOCTYPE html><html><head></head><body>login</body></html>').buffer,
});

const dl = await downloadPrivateUrl({ token: 'x-token' }, 'https://files.slack.com/private');
assert.equal(dl.ok, false, 'html response must not be treated as binary');
assert.equal(dl.code, 'attachment_download_received_html');
assert.ok(
  String(dl.reason).includes('HTML'),
  'failure reason mentions HTML',
);
assert.ok(
  dl.reason.includes('파일 대신'),
  'Korean failure reason',
);

globalThis.fetch = originalFetch;

let visionTouched = false;
const stubOpenai = {
  chat: {
    completions: {
      create: async () => {
        visionTouched = true;
        return { choices: [{ message: { content: 'bad' } }] };
      },
    },
  },
};

const stubClient = {
  token: 't',
  files: {
    info: async () => ({
      file: {
        id: 'F1',
        name: 'shot.png',
        mimetype: 'image/png',
        url_private_download: 'https://files.slack.com/x',
      },
    }),
  },
};

globalThis.fetch = async () => ({
  ok: true,
  url: 'https://files.slack.com/x',
  headers: {
    get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html' : null),
  },
  arrayBuffer: async () => new TextEncoder().encode('<html><body>x</body></html>').buffer,
});

const ingested = await ingestCurrentTurnAttachments({
  client: stubClient,
  files: [{ id: 'F1', name: 'shot.png' }],
  openai: stubOpenai,
  model: 'gpt-4o',
});
assert.equal(ingested.length, 1);
assert.equal(ingested[0].ok, false);
assert.ok(ingested[0].reason.includes('HTML'), 'ingest surfaces transport failure');
assert.equal(visionTouched, false, 'image extractor must not run when download is HTML');

globalThis.fetch = originalFetch;

console.log('test-attachment-transport-truth: ok');
