#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveMvpFileKind, extractMvpFileFromBuffer } from '../src/features/slackFileIntake.js';

for (const [name, mime] of [
  ['a.jpg', 'image/jpeg'],
  ['b.jpeg', 'image/jpeg'],
  ['c.webp', 'image/webp'],
]) {
  const r = resolveMvpFileKind(name, mime);
  assert.equal(r.ok, true, name);
  assert.equal(r.kind, 'image', name);
}

const mockVision = async () => ({ ok: true, text: 'mock jpeg summary' });
const jpgMinimal = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0xff, 0xd9,
]);
const jr = await extractMvpFileFromBuffer({
  buffer: jpgMinimal,
  filename: 'tiny.jpg',
  mimetype: 'image/jpeg',
  summarizePng: mockVision,
  maxBytes: 1024 * 1024,
});
assert.equal(jr.ok, true);
assert.ok(String(jr.text || '').includes('mock jpeg'));

console.log('ok: vnext13_13_image_kind_expansion');
