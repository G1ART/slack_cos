/**
 * files.slack.com → slackusercontent.com 리다이렉트 호스트 허용.
 */
import assert from 'node:assert/strict';
import { downloadSlackPrivateFile, isAllowedSlackRedirectHost } from '../src/founder/ingestAttachments.js';

assert.equal(isAllowedSlackRedirectHost('files.slackusercontent.com'), true);

const onePxPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const prevFetch = globalThis.fetch;
let n = 0;
globalThis.fetch = async (url, init) => {
  n += 1;
  const hdrs = init?.headers;
  const auth =
    hdrs && typeof /** @type {any} */ (hdrs).get === 'function'
      ? /** @type {any} */ (hdrs).get('Authorization')
      : /** @type {any} */ (hdrs)?.Authorization;
  assert.ok(String(auth || '').startsWith('Bearer '));
  if (n === 1) {
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://files.slackusercontent.com/final.png' },
    });
  }
  assert.equal(String(url), 'https://files.slackusercontent.com/final.png');
  return new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });
};

try {
  const r = await downloadSlackPrivateFile({
    client: { token: 't' },
    url: 'https://files.slack.com/start-cdn',
    maxRedirects: 5,
    urlVariant: 'url_private_download',
  });
  assert.equal(r.ok, true);
  assert.equal(n, 2);
} finally {
  globalThis.fetch = prevFetch;
}

console.log('test-attachment-slackusercontent-redirect: ok');
