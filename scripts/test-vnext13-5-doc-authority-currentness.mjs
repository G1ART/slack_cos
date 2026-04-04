#!/usr/bin/env node
/** vNext.13.5 — docs authority chain keywords */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const handoff = await fs.readFile(path.join(root, 'docs/HANDOFF.md'), 'utf8');
assert.match(handoff, /vNext\.13\.5|13\.5/);
assert.match(handoff, /FOUNDATION_RESET/);

const releaseLock = await fs.readFile(path.join(root, 'docs/RELEASE_LOCK.md'), 'utf8');
assert.match(releaseLock, /runFounderDirectKernel/);
assert.match(releaseLock, /lineage|artifact-gated/i);

const foundation = await fs.readFile(path.join(root, 'docs/FOUNDATION_RESET.md'), 'utf8');
assert.match(foundation, /Raw founder text/);
assert.match(foundation, /validateExecutionArtifactForSpine/);

console.log('ok: vnext13_5_doc_authority_currentness');
