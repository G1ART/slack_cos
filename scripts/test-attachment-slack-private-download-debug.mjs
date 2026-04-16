/**
 * Slack 비공개 첨부 다운로드 경계: 리다이렉트·HTML·호스트·URL 우선순위·MIME 라우팅.
 */
import assert from 'node:assert/strict';
import {
  downloadSlackPrivateFile,
  ingestCurrentTurnAttachments,
  isAllowedSlackRedirectHost,
  pickSlackPrivateFileUrl,
} from '../src/founder/ingestAttachments.js';

const onePxPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// --- T3: 302 then binary, Authorization preserved ---
{
  const prev = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (url, init) => {
    n += 1;
    const auth = init?.headers && /** @type {any} */ (init.headers).Authorization;
    assert.ok(String(auth || '').startsWith('Bearer '), `call ${n} has bearer`);
    if (n === 1) {
      assert.equal(String(url), 'https://files.slack.com/start');
      return new Response(null, { status: 302, headers: { Location: '/final.bin' } });
    }
    assert.equal(String(url), 'https://files.slack.com/final.bin');
    return new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    const r = await downloadSlackPrivateFile({
      client: { token: 'tok-t3' },
      url: 'https://files.slack.com/start',
      maxRedirects: 5,
      urlVariant: 'url_private_download',
    });
    assert.equal(r.ok, true);
    assert.equal(n, 2);
    assert.equal(r.diagnostics.redirect_count, 1);
    assert.equal(r.diagnostics.final_host, 'files.slack.com');
  } finally {
    globalThis.fetch = prev;
  }
}

// --- T4: 200 text/html -> failure code, no binary success ---
{
  const prev = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('<!DOCTYPE html><html><body>login</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  try {
    const r = await downloadSlackPrivateFile({
      client: { token: 'tok-t4' },
      url: 'https://files.slack.com/doc',
      urlVariant: 'url_private_download',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'attachment_download_received_html');
    assert.equal(r.diagnostics.html_detected, true);
  } finally {
    globalThis.fetch = prev;
  }
}

// --- T5: disallowed redirect host ---
{
  const prev = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.example.com/stolen' },
    });
  };
  try {
    const r = await downloadSlackPrivateFile({
      client: { token: 'tok-t5' },
      url: 'https://files.slack.com/x',
      urlVariant: 'url_private',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'attachment_download_disallowed_redirect_host');
    assert.equal(fetchCount, 1, '악성 호스트로는 follow 하지 않음');
  } finally {
    globalThis.fetch = prev;
  }
}

assert.equal(isAllowedSlackRedirectHost('files.slack.com'), true);
assert.equal(isAllowedSlackRedirectHost('evil.com'), false);

// --- T6: url_private_download preferred when both exist ---
{
  const p = pickSlackPrivateFileUrl({
    url_private_download: 'https://files.slack.com/ONLY_DOWNLOAD',
    url_private: 'https://files.slack.com/ONLY_PRIVATE',
  });
  assert.ok(p);
  assert.equal(p.variant, 'url_private_download');
  assert.equal(p.url, 'https://files.slack.com/ONLY_DOWNLOAD');

  const prev = globalThis.fetch;
  let firstUrl = '';
  globalThis.fetch = async (url) => {
    if (!firstUrl) firstUrl = String(url);
    return new Response(onePxPng, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    await ingestCurrentTurnAttachments({
      client: /** @type {any} */ ({
        token: 'x',
        files: {
          info: async () => {
            throw new Error('files.info must not run');
          },
        },
      }),
      openai: {
        chat: {
          completions: {
            create: async () => ({ choices: [{ message: { content: 'ok' } }] }),
          },
        },
      },
      model: 'gpt-4o',
      files: [
        {
          id: 'Fp',
          name: 'p.png',
          mimetype: 'image/png',
          url_private_download: 'https://files.slack.com/ONLY_DOWNLOAD',
          url_private: 'https://files.slack.com/ONLY_PRIVATE',
        },
      ],
    });
    assert.equal(firstUrl, 'https://files.slack.com/ONLY_DOWNLOAD');
  } finally {
    globalThis.fetch = prev;
  }
}

// --- T7: supported MIME routing after binary success (image / pdf / docx) ---
{
  const minimalPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
    'utf8',
  );
  const zipDocx = Buffer.from('PK\x03\x04' + 'x'.repeat(40), 'utf8');

  const prev = globalThis.fetch;
  let idx = 0;
  const bodies = [onePxPng, minimalPdf, zipDocx];
  const types = ['image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  globalThis.fetch = async () => {
    const i = idx;
    idx += 1;
    return new Response(bodies[i], { status: 200, headers: { 'content-type': types[i] } });
  };

  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: 'vision ok' } }] }),
      },
    },
  };
  const stubClient = {
    token: 't',
    files: {
      info: async () => {
        throw new Error('no files.info');
      },
    },
  };

  try {
    const img = await ingestCurrentTurnAttachments({
      client: /** @type {any} */ (stubClient),
      openai: /** @type {any} */ (openai),
      model: 'gpt-4o',
      files: [
        {
          id: 'I1',
          name: 'a.png',
          mimetype: 'image/png',
          url_private_download: 'https://files.slack.com/i1',
        },
      ],
    });
    assert.equal(img[0].ok, true);
    assert.equal(img[0].summary, 'vision ok');

    const pdf = await ingestCurrentTurnAttachments({
      client: /** @type {any} */ (stubClient),
      openai: /** @type {any} */ (openai),
      model: 'gpt-4o',
      files: [
        {
          id: 'P1',
          name: 'a.pdf',
          mimetype: 'application/pdf',
          url_private_download: 'https://files.slack.com/p1',
        },
      ],
    });
    assert.ok(
      pdf[0].ok === true ||
        (pdf[0].ok === false &&
          /PDF|파일을 읽는 중/.test(String(pdf[0].reason || ''))),
      `PDF 파서 경로(다운로드 성공 후): ${pdf[0].reason}`,
    );

    const docx = await ingestCurrentTurnAttachments({
      client: /** @type {any} */ (stubClient),
      openai: /** @type {any} */ (openai),
      model: 'gpt-4o',
      files: [
        {
          id: 'D1',
          name: 'a.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          url_private_download: 'https://files.slack.com/d1',
        },
      ],
    });
    assert.equal(docx.length, 1);
    assert.ok(
      docx[0].ok === true ||
        /DOCX|파일을 읽는 중|손상/.test(String(docx[0].reason || '')),
      `DOCX 파서 경로(다운로드 성공 후): ${docx[0].reason}`,
    );
  } finally {
    globalThis.fetch = prev;
  }
}

console.log('test-attachment-slack-private-download-debug: ok');
