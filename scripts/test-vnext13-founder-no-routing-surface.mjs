#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, '..', 'app.js');
const appSrc = fs.readFileSync(appPath, 'utf8');
const start = appSrc.indexOf('if (founderRoute) {');
const opOnly = appSrc.indexOf('// Operator / channel only');
assert.ok(start !== -1 && opOnly !== -1 && opOnly > start);
const founderBlock = appSrc.slice(start, opOnly);
assert.ok(!founderBlock.includes('runInboundCommandRouter'));
assert.ok(!founderBlock.includes('runInboundAiRouter'));
assert.ok(!founderBlock.includes('founderCanUseCommandRouter'));
assert.ok(!founderBlock.includes('structuredOnly'));

const pipePath = path.join(__dirname, '..', 'src', 'core', 'founderRequestPipeline.js');
const pipeSrc = fs.readFileSync(pipePath, 'utf8');
const idxFour = pipeSrc.indexOf('return founderDirectInboundFourStep');
const idxGold = pipeSrc.indexOf('classifyGoldContract(normalized, metadata)');
assert.ok(idxFour !== -1 && idxGold !== -1);
assert.ok(idxFour < idxGold, 'founder DM returns before operator gold/intent spine');

const { founderRequestPipeline } = await import('../src/core/founderRequestPipeline.js');
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
const out = await founderRequestPipeline({ text: 'short status', metadata: meta });
assert.equal(out.trace.founder_classifier_used, false);
assert.equal(out.trace.founder_keyword_route_used, false);
assert.equal(out.trace.legacy_command_router_used, false);
assert.equal(out.trace.legacy_ai_router_used, false);

console.log('ok: vnext13_founder_no_routing_surface');
