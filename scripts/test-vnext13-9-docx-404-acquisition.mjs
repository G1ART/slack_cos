#!/usr/bin/env node
import assert from 'node:assert/strict';
import { ingestSlackFile } from '../src/features/slackFileIntake.js';

const prevFetch = globalThis.fetch;
const prevToken = process.env.SLACK_BOT_TOKEN;
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

try {
  globalThis.fetch = async () => new Response('', { status: 404 });

  const out = await ingestSlackFile({
    threadKey: 'ch:t:k2',
    file: {
      id: 'Fdoc1',
      name: 'memo.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      url_private_download: 'https://files.slack.com/missing',
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.acquire_trace?.failure_code, 'not_found');
} finally {
  globalThis.fetch = prevFetch;
  if (prevToken === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = prevToken;
}

console.log('ok: vnext13_9_docx_404_acquisition');
