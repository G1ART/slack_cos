import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const banned = [
  'handleUserText',
  'runInboundAiRouter',
  'runInboundCommandRouter',
  'founderRequestPipeline',
];

const spineFiles = [
  'app.js',
  'src/founder/registerFounderHandlers.js',
  'src/founder/handleFounderSlackTurn.js',
  'src/founder/runFounderDirectConversation.js',
  'src/founder/sendFounderResponse.js',
  'src/founder/ingestAttachments.js',
  'src/founder/threadMemory.js',
];

for (const rel of spineFiles) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const b of banned) {
    assert.ok(!src.includes(b), `${rel} must not reference ${b}`);
  }
}

const reg = fs.readFileSync(path.join(root, 'src/founder/registerFounderHandlers.js'), 'utf8');
assert.ok(reg.includes('handleFounderSlackTurn'), 'register must call handleFounderSlackTurn');
assert.ok(reg.includes('sendFounderResponse'), 'register must use sendFounderResponse');

const h = fs.readFileSync(path.join(root, 'src/founder/handleFounderSlackTurn.js'), 'utf8');
assert.ok(h.includes('runFounderDirectConversation'), 'controller must call runFounderDirectConversation');

console.log('test-founder-spine: ok');
