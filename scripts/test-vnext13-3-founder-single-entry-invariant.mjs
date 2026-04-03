#!/usr/bin/env node
/** vNext.13.3 — founder_route 판정 SSOT: app.js · runInboundAiRouter 가 동일 모듈만 사용 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFounderRouteDecision, traceFounderRouteInvariant } from '../src/founder/founderRouteInvariant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const routerSrc = fs.readFileSync(path.join(root, 'src', 'features', 'runInboundAiRouter.js'), 'utf8');

assert.ok(appSrc.includes("from './src/founder/founderRouteInvariant.js'"), 'app imports founderRouteInvariant');
assert.ok(!appSrc.includes('function isFounderFacingRoute'), 'isFounderFacingRoute removed from app');
assert.ok(routerSrc.includes("from '../founder/founderRouteInvariant.js'"), 'router imports invariant');
assert.ok(!routerSrc.includes('channel_mention'), 'router must not inline founder channel_mention check');
assert.ok(!routerSrc.includes('dm_ai_router'), 'router must not inline founder route label check');

const d1 = resolveFounderRouteDecision({ source_type: 'direct_message', channel: 'C1' });
assert.equal(d1.founder_route, true);
const d2 = resolveFounderRouteDecision({ source_type: 'channel', channel: 'D123', slack_route_label: '' });
assert.equal(d2.founder_route, true);
const d3 = resolveFounderRouteDecision({ source_type: 'channel', channel: 'C123', slack_route_label: 'dm_ai_router' });
assert.equal(d3.founder_route, true);
const d4 = resolveFounderRouteDecision({ source_type: 'channel', channel: 'Cxyz' });
assert.equal(d4.founder_route, false);

const tr = traceFounderRouteInvariant({ source_type: 'direct_message', channel: 'Dx' });
assert.equal(tr.founder_entry_ssot, 'src/founder/founderRouteInvariant.js');
assert.equal(tr.founder_route, true);

console.log('ok: vnext13_3_founder_single_entry_invariant');
