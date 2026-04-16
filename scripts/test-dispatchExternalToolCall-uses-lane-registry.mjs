import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/founder/toolPlane/dispatchExternalToolCall.js'), 'utf8');

assert.ok(src.includes('getLaneAdapter(tool)'), 'dispatch must resolve adapters via registry');
assert.ok(!src.includes('TOOL_ADAPTERS'), 'dispatch must not use legacy monolithic TOOL_ADAPTERS table');
assert.ok(src.includes('dispatchExternalToolCall'), 'dispatch entry present');

console.log('test-dispatchExternalToolCall-uses-lane-registry: ok');
