#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  peekPayloadNature,
  resolveEffectiveKindAfterDownload,
} from '../src/features/slackFileIntake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlBuf = Buffer.from('<!DOCTYPE html><html><body>login</body></html>', 'utf8');
assert.equal(peekPayloadNature(htmlBuf).kind, 'html');

const r = resolveEffectiveKindAfterDownload(htmlBuf, 'report.pdf', 'application/pdf', 'text/html; charset=utf-8');
assert.equal(r.errorCode, 'downloaded_html_instead_of_file');
assert.ok(r.trace?.payload_nature);

const pdfPath = path.join(__dirname, '..', 'node_modules', 'pdf-parse', 'test', 'data', '05-versions-space.pdf');
const pdfBuf = await fs.readFile(pdfPath);
const rPdf = resolveEffectiveKindAfterDownload(pdfBuf, 'weird.png', 'image/png', 'application/octet-stream');
assert.equal(rPdf.effectiveKind, 'pdf');
assert.equal(rPdf.trace?.kind_source, 'payload_signature');

console.log('ok: vnext13_7_download_html_preview_detected');
