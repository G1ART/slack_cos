/**
 * Slack Document Context — 인제스트된 파일 내용을 thread/project에 연결하여
 * 후속 대화에서 참조할 수 있도록 관리.
 *
 * 디스크 persist + startup hydration 지원.
 */

import { readJsonArray, writeJsonArray, ensureJsonFile } from '../storage/jsonStore.js';
import { DATA_DIR } from '../storage/paths.js';
import path from 'path';

const DOC_CONTEXT_FILE = path.join(DATA_DIR, 'document-context.json');

function resolveDocPath() {
  const v = process.env.DOCUMENT_CONTEXT_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.resolve(process.cwd(), v);
  return DOC_CONTEXT_FILE;
}

const MAX_DOCS_PER_THREAD = 10;
const MAX_TEXT_PER_DOC = 30000;

/** @type {Map<string, object[]>} threadKey -> document entries */
const documentsByThread = new Map();

/**
 * Store ingested document text for a thread.
 */
export function addDocumentToThread(threadKey, doc) {
  if (!threadKey || !doc) return;
  const entry = {
    file_id: doc.file_id || null,
    filename: doc.filename || 'unknown',
    text: String(doc.text || '').slice(0, MAX_TEXT_PER_DOC),
    mimetype: doc.mimetype || '',
    ingested_at: new Date().toISOString(),
    char_count: doc.char_count || (doc.text?.length || 0),
    truncated: doc.truncated || false,
  };

  if (!documentsByThread.has(threadKey)) {
    documentsByThread.set(threadKey, []);
  }
  documentsByThread.get(threadKey).push(entry);

  if (documentsByThread.get(threadKey).length > MAX_DOCS_PER_THREAD) {
    documentsByThread.get(threadKey).shift();
  }

  persistDocContext();
}

/**
 * Get all document context for a thread.
 */
export function getDocumentContextForThread(threadKey) {
  const docs = documentsByThread.get(threadKey);
  if (!docs || docs.length === 0) return null;
  return docs;
}

/**
 * Get merged document text for LLM context.
 */
export function getMergedDocumentText(threadKey, maxLength = 8000) {
  const docs = documentsByThread.get(threadKey);
  if (!docs || docs.length === 0) return null;

  const parts = [];
  let totalLen = 0;
  for (const doc of docs) {
    if (totalLen >= maxLength) break;
    const remaining = maxLength - totalLen;
    const text = doc.text.slice(0, remaining);
    parts.push(`[파일: ${doc.filename}]\n${text}`);
    totalLen += text.length;
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Check if thread has any ingested documents.
 */
export function hasDocumentContext(threadKey) {
  const docs = documentsByThread.get(threadKey);
  return docs && docs.length > 0;
}

/**
 * Get count of documents for a thread.
 */
export function getDocumentCount(threadKey) {
  return documentsByThread.get(threadKey)?.length || 0;
}

/**
 * Clear document context for a thread.
 */
export function clearDocumentContext(threadKey) {
  documentsByThread.delete(threadKey);
  persistDocContext();
}

function persistEnabled() {
  const v = process.env.DOCUMENT_CONTEXT_PERSIST;
  if (v === '0' || v === 'false') return false;
  return true;
}

function persistDocContext() {
  if (!persistEnabled()) return;
  const fp = resolveDocPath();
  const data = [];
  for (const [threadKey, docs] of documentsByThread.entries()) {
    data.push({ threadKey, docs });
  }
  writeJsonArray(fp, data).catch(() => {});
}

export async function loadDocumentContextFromDisk() {
  if (!persistEnabled()) return 0;
  const fp = resolveDocPath();
  await ensureJsonFile(fp, '[]');
  const arr = await readJsonArray(fp);
  let count = 0;
  for (const entry of arr) {
    if (entry.threadKey && Array.isArray(entry.docs)) {
      documentsByThread.set(entry.threadKey, entry.docs);
      count += entry.docs.length;
    }
  }
  return count;
}

export async function flushDocumentContextToDisk() {
  if (!persistEnabled()) return;
  const fp = resolveDocPath();
  const data = [];
  for (const [threadKey, docs] of documentsByThread.entries()) {
    data.push({ threadKey, docs });
  }
  await writeJsonArray(fp, data);
}

export function _resetForTest() {
  documentsByThread.clear();
}
