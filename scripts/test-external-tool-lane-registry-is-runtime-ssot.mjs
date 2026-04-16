import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExternalLaneRuntime, getLaneAdapter, listExternalToolLaneDescriptors } from '../src/founder/toolPlane/externalToolLaneRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const regSrc = fs.readFileSync(path.join(root, 'src/founder/toolPlane/externalToolLaneRegistry.js'), 'utf8');

assert.ok(regSrc.includes('LANE_RUNTIME'), 'registry must hold runtime lane table');
assert.ok(!/metadata only|keep in sync with toolsBridge/i.test(regSrc), 'registry must not claim toolsBridge is SSOT');
assert.ok(regSrc.includes('getLaneAdapter'), 'registry exposes lane adapter resolution');

const gh = getExternalLaneRuntime('github');
assert.ok(gh && gh.adapter && typeof gh.adapter.executeLive === 'function');
assert.ok(typeof gh.getAdapterReadiness === 'function');
assert.ok(typeof gh.invocationPrecheck === 'function');
assert.ok(getLaneAdapter('github') === gh.adapter);

const desc = listExternalToolLaneDescriptors();
assert.equal(desc.length, 5);
assert.ok(desc.every((d) => d.laneKey && d.supportedActions?.length));

console.log('test-external-tool-lane-registry-is-runtime-ssot: ok');
