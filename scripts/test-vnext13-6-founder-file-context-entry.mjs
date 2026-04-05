#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildFounderFileContextEntry } from '../src/founder/founderFileContextRecord.js';

const okEntry = buildFounderFileContextEntry('T1', {
  ok: true,
  file_id: 'F99',
  filename: 'ok.docx',
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'full text',
  summary: 'short',
  truncated: true,
});
assert.equal(okEntry.extract_status, 'partial');
assert.equal(okEntry.summary, 'short');

const failEntry = buildFounderFileContextEntry('T1', {
  ok: false,
  file_id: 'F98',
  filename: 'bad.pdf',
  mimetype: 'application/pdf',
  errorCode: 'pdf_no_text_layer',
});
assert.equal(failEntry.extract_status, 'failed');
assert.equal(failEntry.error_code, 'pdf_no_text_layer');

console.log('ok: vnext13_6_founder_file_context_entry');
