/**
 * G1 COS — vNext.13.16 founder-only minimal transport.
 * 단일 헌법: CONSTITUTION.md. 레거시 라우터·구 텍스트 파이프라인 미포함.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bolt from '@slack/bolt';
import OpenAI from 'openai';

import { validateEnv, formatEnvCheck } from './src/runtime/env.js';
import {
  attachGracefulShutdown,
  attachUnhandledRejectionLogging,
  attachUncaughtExceptionLogging,
  assertSocketModeMajorAtLeast2,
  logSlackSdkVersions,
  startSlackAppWithRetry,
} from './src/runtime/startup.js';
import { formatError } from './src/util/formatError.js';
import { registerFounderHandlers } from './src/slack/registerFounderHandlers.js';
import { extractForbiddenPhrasesFromConstitution } from './src/founder/constitutionExtract.js';

const { App } = bolt;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTITUTION_PATH = path.join(__dirname, 'CONSTITUTION.md');

const constitutionMarkdown = fs.readFileSync(CONSTITUTION_PATH, 'utf8');
const constitutionSha256 = crypto.createHash('sha256').update(constitutionMarkdown, 'utf8').digest('hex');
const forbiddenSubstrings = extractForbiddenPhrasesFromConstitution(constitutionMarkdown);

console.info(
  JSON.stringify({
    event: 'constitution_loaded',
    path: 'CONSTITUTION.md',
    sha256: constitutionSha256,
    forbidden_phrase_count: forbiddenSubstrings.length,
  }),
);

const envCheck = validateEnv();
console.log(formatEnvCheck(envCheck));
if (!envCheck.ok) {
  console.error('[fatal] Missing env:', envCheck.missing.join(', '));
  process.exit(1);
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callText({ instructions, input }) {
  const response = await openai.responses.create({
    model: MODEL,
    instructions,
    input,
  });
  const text = response.output_text?.trim();
  if (!text) {
    throw new Error('Text output was empty');
  }
  return text;
}

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerFounderHandlers(slackApp, {
  formatError,
  callText,
  constitutionMarkdown,
  forbiddenSubstrings,
});

(async () => {
  attachUnhandledRejectionLogging({ logger: console });
  attachUncaughtExceptionLogging({ logger: console });
  logSlackSdkVersions({ logger: console });
  assertSocketModeMajorAtLeast2({ logger: console });

  attachGracefulShutdown({ slackApp, logger: console });

  console.log(
    JSON.stringify({
      stage: 'startup',
      model: MODEL,
      pipeline: 'vNext.13.16.constitution_only',
    }),
  );

  try {
    await startSlackAppWithRetry(slackApp, { attempts: 5, delayMs: 3000, logger: console });
    console.log('[startup] G1 COS founder-only is running.');
  } catch (err) {
    console.error('[startup] Slack 연결 실패:', formatError(err));
    process.exit(1);
  }
})();
