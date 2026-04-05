#!/usr/bin/env node
import assert from 'node:assert/strict';
import { FOUNDER_FILE_FAILURE_SURFACE } from '../src/features/founderSlackFileTurn.js';
import { FounderSurfaceType } from '../src/core/founderContracts.js';

assert.equal(FOUNDER_FILE_FAILURE_SURFACE, FounderSurfaceType.PARTNER_NATURAL);

console.log('ok: vnext13_7_founder_direct_file_failure_surface');
