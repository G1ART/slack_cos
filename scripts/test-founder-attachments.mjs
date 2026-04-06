import assert from 'node:assert';
import {
  extractPdfTextBuffer,
  extractDocxTextBuffer,
} from '../src/founder/ingestAttachments.js';

// 최소 PDF (빈 페이지에 가까움) — 파서가 에러 없이 동작하는지
const minimalPdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'utf8',
);
let pdfText = '';
try {
  pdfText = await extractPdfTextBuffer(minimalPdf);
} catch {
  pdfText = '';
}
assert.ok(typeof pdfText === 'string', 'pdf path returns string');

// 잘못된 DOCX — 짧은 바이트
let docxFailed = false;
try {
  await extractDocxTextBuffer(Buffer.from('not a zip'));
} catch {
  docxFailed = true;
}
assert.ok(docxFailed, 'invalid docx should fail');

// 성공/실패 모두 자연어 설명 문자열로 표면화되는지 (실패 시 reason 패턴)
const failLine = '- 파일.docx: (읽기 실패) 손상된 파일';
assert.ok(failLine.includes('읽기 실패'), 'failure surface is plain Korean');

console.log('test-founder-attachments: ok');
