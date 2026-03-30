/**
 * Slack Document Context — 인제스트된 파일 내용을 thread/project에 연결하여
 * 후속 대화에서 참조할 수 있도록 관리.
 */

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
    text: doc.text || '',
    mimetype: doc.mimetype || '',
    ingested_at: new Date().toISOString(),
    char_count: doc.char_count || (doc.text?.length || 0),
    truncated: doc.truncated || false,
  };

  if (!documentsByThread.has(threadKey)) {
    documentsByThread.set(threadKey, []);
  }
  documentsByThread.get(threadKey).push(entry);

  if (documentsByThread.get(threadKey).length > 10) {
    documentsByThread.get(threadKey).shift();
  }
}

/**
 * Get all document context for a thread.
 * Returns concatenated text of all ingested documents.
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
}

export function _resetForTest() {
  documentsByThread.clear();
}
