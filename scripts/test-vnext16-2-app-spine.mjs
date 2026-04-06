import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(appSrc.includes("from './src/slack/registerFounderHandlers.js'"), 'app must register founder handlers only');
assert.ok(!appSrc.includes('registerHandlers'), 'app must not reference registerHandlers');
assert.ok(!appSrc.includes('handleUserText'), 'app must not import handleUserText');
assert.ok(appSrc.includes('CONSTITUTION.md'), 'app must load CONSTITUTION.md');
assert.ok(appSrc.includes('extractForbiddenPhrasesFromConstitution'), 'app must parse forbidden phrases');

console.log('test-vnext16-2-app-spine: ok');
