#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'founder', 'founderDirectKernel.js'), 'utf8');

const importBlock = src.split('async function runFounderConversationPipeline')[0] || '';
assert.ok(importBlock.includes("from './founderProposalKernel.js'"));
assert.ok(importBlock.includes('buildProposalPacketFromSidecar'));
assert.ok(!importBlock.includes('formatFullFounderProposalSurface'));
assert.ok(!importBlock.includes('founderApprovalPacket'));

console.log('ok: vnext13_8_founder_import_chain_subtracted');
