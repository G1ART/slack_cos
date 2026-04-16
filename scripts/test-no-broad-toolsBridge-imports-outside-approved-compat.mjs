import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const restricted = [
  'src/founder/runFounderDirectConversation.js',
  'src/founder/founderCosToolHandlers.js',
  'src/founder/toolPlane/executeFounderCosToolCall.js',
];

for (const rel of restricted) {
  const s = read(rel);
  assert.ok(
    !s.includes("from './toolsBridge.js'") && !s.includes('from "../toolsBridge.js"'),
    `${rel} must not import toolsBridge facade; use toolPlane narrow modules`,
  );
}

console.log('test-no-broad-toolsBridge-imports-outside-approved-compat: ok');
