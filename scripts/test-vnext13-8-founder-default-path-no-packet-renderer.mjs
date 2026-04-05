#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'founder', 'founderDirectKernel.js'), 'utf8');

assert.ok(!src.includes('formatFullFounderProposalSurface'));
assert.ok(!src.includes('buildFounderApprovalPacket'));
assert.ok(!src.includes('buildProposalFromFounderInput'));
assert.ok(!src.includes('maybeGovernanceAdvisoryForFounder'));

console.log('ok: vnext13_8_founder_default_path_no_packet_renderer');
