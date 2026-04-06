#!/usr/bin/env node
/** vNext.13.10 — 창업자 커널 기본 경로에 제안 패킷 렌더·플래너 import 없음 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'founder', 'founderDirectKernel.js'), 'utf8');

assert.ok(!src.includes('founderProposalKernel'), 'founderDirectKernel must not import proposal kernel');
assert.ok(!src.includes('planFounderConversationTurn'), 'founderDirectKernel must not import conversation planner');
assert.ok(!src.includes('tryArtifactGatedExecutionSpine'), 'founderDirectKernel must not import artifact gate');
assert.ok(src.includes('runFounderNaturalChatOnly') || src.includes('natural_chat_only'), 'natural chat-only path present');
assert.ok(src.includes('runFounderArtifactConversationPipeline'), 'artifact pipeline re-export for regression');

console.log('ok: vnext13_8_founder_import_chain_subtracted');
