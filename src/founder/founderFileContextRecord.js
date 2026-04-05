/**
 * vNext.13.6 — durable_state.latest_file_contexts 항목 생성.
 */

/**
 * @param {string} threadKey
 * @param {object} ingestResult ingestSlackFile / extractMvpFileFromBuffer 결과
 */
export function buildFounderFileContextEntry(threadKey, ingestResult) {
  const tk = String(threadKey || '').trim() || 'unknown';
  const r = ingestResult || {};
  if (r.ok) {
    const raw = String(r.summary ?? r.text ?? '').trim();
    const summary = raw.slice(0, 4000);
    return {
      file_id: r.file_id ?? null,
      filename: r.filename ?? 'unknown',
      mime_type: r.mimetype ?? null,
      summary,
      extract_status: r.truncated ? 'partial' : 'ok',
      attached_at: new Date().toISOString(),
      thread_key: tk,
    };
  }
  return {
    file_id: r.file_id ?? null,
    filename: r.filename ?? 'unknown',
    mime_type: r.mimetype ?? null,
    summary: '',
    extract_status: 'failed',
    error_code: r.errorCode || 'unknown',
    attached_at: new Date().toISOString(),
    thread_key: tk,
  };
}
