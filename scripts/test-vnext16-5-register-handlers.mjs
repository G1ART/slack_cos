import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slack', 'registerFounderHandlers.js'), 'utf8');

assert.ok(src.includes('registerFounderHandlers'), 'module must export registerFounderHandlers');
assert.ok(src.includes('constitutionMarkdown'), 'handlers must accept constitutionMarkdown');
assert.ok(src.includes('forbiddenSubstrings'), 'handlers must pass forbidden list to sendFounderResponse');
assert.ok(!src.includes('isActiveProjectIntake'), 'founder-only register must not branch on intake');
assert.ok(!src.includes('tryFinalizeSlackQueryRoute'), 'founder-only register must not use query router');

console.log('test-vnext16-5-register-handlers: ok');
