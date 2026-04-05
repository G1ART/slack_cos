#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractMvpFileFromBuffer } from '../src/features/slackFileIntake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(__dirname, '..', 'node_modules', 'pdf-parse', 'test', 'data', '05-versions-space.pdf');
const pdfBuf = await fs.readFile(pdfPath);

const pr = await extractMvpFileFromBuffer({
  buffer: pdfBuf,
  filename: 'sample.pdf',
  mimetype: 'application/pdf',
  maxBytes: 5 * 1024 * 1024,
});
assert.equal(pr.ok, true);
assert.ok(String(pr.text || '').length > 20);
assert.ok(String(pr.summary || '').length > 0);

const HEX =
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050000270000000049454e444ae4260820';
const png1x1 = Buffer.from(HEX, 'hex');

const mockVision = async () => ({ ok: true, text: 'mock png summary' });
const pngR = await extractMvpFileFromBuffer({
  buffer: png1x1,
  filename: 'pixel.png',
  mimetype: 'image/png',
  summarizePng: mockVision,
  maxBytes: 1024 * 1024,
});
assert.equal(pngR.ok, true);
assert.ok(String(pngR.text || '').includes('mock'));

console.log('ok: vnext13_6_extract_mvp_buffer_pdf_png');
