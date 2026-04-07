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
import { getDelegateHarnessTeamParametersSnapshot } from './src/founder/runFounderDirectConversation.js';
import { startRunSupervisorLoop, tickRunSupervisorForThread } from './src/founder/runSupervisor.js';
import { registerRunStateChangeListener } from './src/founder/supervisorDirectTrigger.js';
import { startCosHttpServer } from './src/founder/httpExternalIngress.js';

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

registerRunStateChangeListener((threadKey) => {
  tickRunSupervisorForThread(threadKey, {
    client: slackApp.client,
    constitutionSha256,
    skipLease: false,
  }).catch((e) => console.error('[cos_direct_supervisor]', e));
});

registerFounderHandlers(slackApp, {
  openai,
  model: MODEL,
  visionModel: process.env.OPENAI_VISION_MODEL,
  constitutionMarkdown,
  constitutionSha256,
});

const dhProps = getDelegateHarnessTeamParametersSnapshot()?.properties;
const delegateKeys =
  dhProps && typeof dhProps === 'object' && !Array.isArray(dhProps) ? Object.keys(dhProps).sort() : [];
console.info(
  JSON.stringify({
    event: 'cos_boot_delegate_schema',
    delegate_parameter_keys: delegateKeys,
    delegate_schema_includes_packets: delegateKeys.includes('packets'),
    deploy_git_sha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_COMMIT_SHA || null,
  }),
);

await slackApp.start();
console.log('[startup] COS founder spine running.');

await startCosHttpServer({ env: process.env });

if (String(process.env.COS_RUN_SUPERVISOR_DISABLED || '').trim() !== '1') {
  startRunSupervisorLoop({
    client: slackApp.client,
    constitutionSha256,
    intervalMs: Number(process.env.COS_RUN_SUPERVISOR_MS || 45_000),
  });
  console.log('[startup] run supervisor loop enabled.');
}
