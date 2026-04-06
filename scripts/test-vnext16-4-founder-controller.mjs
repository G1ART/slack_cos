import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'founder', 'founderSlackController.js'), 'utf8');

assert.ok(src.includes('runFounderDirectConversation'), 'controller must use direct conversation core');
assert.ok(!src.includes('runFounderDirectKernel'), 'controller must not use legacy kernel');
assert.ok(src.includes('constitutionMarkdown'), 'controller must pass constitution to kernel path');

console.log('test-vnext16-4-founder-controller: ok');
