#!/usr/bin/env node
import assert from 'node:assert/strict';
import { ingestSlackFile } from '../src/features/slackFileIntake.js';

const prevFetch = globalThis.fetch;
const prevToken = process.env.SLACK_BOT_TOKEN;
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

try {
  globalThis.fetch = async () =>
    new Response('<!DOCTYPE html><html><body>preview</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

  const out = await ingestSlackFile({
    threadKey: 'ch:t:k3',
    file: {
      id: 'Fpdf1',
      name: 'deck.pdf',
      mimetype: 'application/pdf',
      url_private_download: 'https://files.slack.com/fake-pdf',
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.errorCode, 'downloaded_html_instead_of_file');
  assert.equal(out.acquire_trace?.failure_code, 'html_instead_of_binary');
} finally {
  globalThis.fetch = prevFetch;
  if (prevToken === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = prevToken;
}

console.log('ok: vnext13_9_pdf_html_acquisition');
