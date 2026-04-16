import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dispatch = fs.readFileSync(path.join(root, 'src/founder/toolPlane/dispatchExternalToolCall.js'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'src/founder/toolPlane/externalToolInvocationFlow.js'), 'utf8');

assert.ok(dispatch.includes('dispatchExternalToolCall'), 'dispatch entry present');
assert.ok(dispatch.includes('runExternalToolInvocationFlow'), 'dispatch delegates to flow');
assert.ok(flow.includes('getLaneAdapter(tool)'), 'flow must resolve adapters via registry');
assert.ok(!flow.includes('TOOL_ADAPTERS'), 'flow must not use legacy monolithic TOOL_ADAPTERS table');

console.log('test-dispatchExternalToolCall-uses-lane-registry: ok');
