#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, '..', 'app.js');
const appSrc = fs.readFileSync(appPath, 'utf8');
assert.ok(appSrc.includes('founder_route_must_not_use_handleUserText'));
const hStart = appSrc.indexOf('async function handleUserText');
const v14 = appSrc.indexOf('// vNext.13.14 — 창업자 멘션/DM은');
assert.ok(hStart !== -1 && v14 !== -1 && v14 > hStart);
const preOp = appSrc.slice(hStart, v14);
assert.ok(!preOp.includes('runInboundCommandRouter'));
assert.ok(!preOp.includes('runInboundAiRouter'));
assert.ok(!preOp.includes('founderCanUseCommandRouter'));
const ctrlPath = path.join(__dirname, '..', 'src', 'founder', 'founderSlackController.js');
const ctrlSrc = fs.readFileSync(ctrlPath, 'utf8');
assert.ok(ctrlSrc.includes('runFounderDirectKernel'), 'founderSlackController calls runFounderDirectKernel');

const kernelPath = path.join(__dirname, '..', 'src', 'founder', 'founderDirectKernel.js');
const kernelSrc = fs.readFileSync(kernelPath, 'utf8');
for (const banned of ['classifyFounderIntent', 'resolveWorkObject', 'resolveWorkPhase', 'WorkPhase']) {
  assert.ok(!kernelSrc.includes(banned), `founderDirectKernel must not reference ${banned}`);
}

const opPipePath = path.join(__dirname, '..', 'src', 'core', 'founderRequestPipeline.js');
const opPipeSrc = fs.readFileSync(opPipePath, 'utf8');
assert.ok(opPipeSrc.includes('classifyGoldContract(normalized, metadata)'), 'operator spine remains in founderRequestPipeline');

const { runFounderDirectKernel } = await import('../src/founder/founderDirectKernel.js');
const { openProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');

const meta = {
  source_type: 'direct_message',
  channel: 'Dv13nr',
  user: 'Uv13nr',
  ts: '1.0',
  slack_route_label: 'dm_ai_router',
  callText: async () => '',
};
openProjectIntakeSession(meta, { goalLine: 'routing surface test' });
const out = await runFounderDirectKernel({ text: 'short status', metadata: meta });
assert.equal(out.trace.founder_classifier_used, false);
assert.equal(out.trace.founder_keyword_route_used, false);
assert.equal(out.trace.legacy_command_router_used, false);
assert.equal(out.trace.legacy_ai_router_used, false);
assert.equal(out.trace.founder_direct_kernel, true);

console.log('ok: vnext13_founder_no_routing_surface');
