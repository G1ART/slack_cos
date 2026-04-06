import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const testLine = pkg.scripts?.test || '';

assert.ok(testLine.includes('test-vnext16-'), 'npm test must run vNext.16 harness');
assert.ok(!testLine.includes('test-vnext13-14'), 'npm test must not run legacy vNext.13.14 chain');
assert.ok(!testLine.includes('replay-slack-fixtures'), 'npm test must not run legacy fixture replay in default chain');

console.log('test-vnext16-7-package-json: ok');
