/**
 * Founder-only COS bootstrap. 레거시 라우터·startup 프레임워크 없음.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bolt from '@slack/bolt';
import OpenAI from 'openai';
import { registerFounderHandlers } from './src/founder/registerFounderHandlers.js';

const { App } = bolt;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN', 'OPENAI_API_KEY'];

function validateEnv() {
  const missing = REQUIRED.filter((k) => !String(process.env[k] || '').trim());
  return { ok: missing.length === 0, missing };
}

const env = validateEnv();
if (!env.ok) {
  console.error('[fatal] Missing env:', env.missing.join(', '));
  process.exit(1);
}

const CONSTITUTION_PATH = path.join(__dirname, 'CONSTITUTION.md');
const constitutionMarkdown = fs.readFileSync(CONSTITUTION_PATH, 'utf8');
const constitutionSha256 = crypto.createHash('sha256').update(constitutionMarkdown, 'utf8').digest('hex');

console.info(
  JSON.stringify({
    event: 'boot',
    constitution_sha256: constitutionSha256,
    constitution_bytes: Buffer.byteLength(constitutionMarkdown, 'utf8'),
  }),
);

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerFounderHandlers(slackApp, {
  openai,
  model: MODEL,
  visionModel: process.env.OPENAI_VISION_MODEL,
  constitutionMarkdown,
  constitutionSha256,
});

await slackApp.start();
console.log('[startup] COS founder spine running.');
