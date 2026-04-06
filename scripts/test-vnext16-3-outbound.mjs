import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'founderOutbound.js'), 'utf8');

assert.ok(src.includes('findForbiddenSubstring'), 'founderOutbound must use constitution-based forbidden check');
assert.ok(!src.includes('founderEgressLock'), 'founderOutbound must not import founderEgressLock');
assert.ok(!src.includes('assertFounderEgressOnly'), 'founderOutbound must not use egress lock assert');
assert.ok(src.includes('founderSurfacesMinimal'), 'founderOutbound must use minimal surfaces');

console.log('test-vnext16-3-outbound: ok');
