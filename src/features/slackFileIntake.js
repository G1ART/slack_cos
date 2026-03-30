/**
 * Slack File Intake — Slack에서 공유된 파일을 인제스트하여
 * 텍스트 추출 후 대화/프로젝트 컨텍스트에 연결.
 *
 * 지원: txt, md, csv, json, pdf(text-only fallback)
 * 실패 시 정확한 사유를 반환 (scope 부족, 형식 미지원, fetch 실패 등)
 */

const SUPPORTED_MIMETYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
]);

const PARSEABLE_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'html', 'htm', 'js', 'ts', 'py', 'rb', 'sh', 'yaml', 'yml', 'toml',
]);

/**
 * Extract files from a Slack event payload.
 * Handles both message.files and file_shared events.
 */
export function extractFilesFromEvent(event) {
  if (!event) return [];
  if (event.files && Array.isArray(event.files)) {
    return event.files;
  }
  if (event.file) {
    return [event.file];
  }
  return [];
}

/**
 * Diagnose whether the Slack app can read files.
 * @param {{ client?: object }} ctx
 */
export function diagnoseFileReadiness(ctx = {}) {
  const issues = [];
  const scopeHint = process.env.SLACK_FILE_READ_SCOPE;

  if (scopeHint === 'false' || scopeHint === '0') {
    issues.push('files:read scope가 명시적으로 비활성화되어 있습니다');
  }

  const hasToken = !!(process.env.SLACK_BOT_TOKEN || process.env.SLACK_APP_TOKEN);
  if (!hasToken) {
    issues.push('SLACK_BOT_TOKEN이 설정되지 않았습니다');
  }

  return {
    ready: issues.length === 0,
    issues,
    supported_types: [...PARSEABLE_EXTENSIONS],
    limitations: [
      'pdf: text-layer만 추출 (이미지 기반 PDF 미지원)',
      'docx/xlsx: 현재 미지원 (향후 추가 예정)',
      'Slack Connect 대화에서 외부 조직 파일은 접근이 제한될 수 있음',
    ],
  };
}

/**
 * Fetch and extract text from a Slack file.
 * @param {{ file: object, client: object }} ctx
 * @returns {Promise<{ ok: boolean, text?: string, error?: string, errorCode?: string, file_id?: string, filename?: string, mimetype?: string }>}
 */
export async function ingestSlackFile({ file, client }) {
  if (!file) {
    return { ok: false, error: '파일 정보가 없습니다', errorCode: 'no_file' };
  }

  const fileId = file.id;
  const filename = file.name || file.title || 'unknown';
  const mimetype = file.mimetype || '';
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (!file.url_private && !file.url_private_download) {
    return {
      ok: false,
      error: '파일 URL이 없습니다. Slack Connect 제한 또는 파일 삭제 가능성',
      errorCode: 'no_url',
      file_id: fileId,
      filename,
      mimetype,
    };
  }

  if (!SUPPORTED_MIMETYPES.has(mimetype) && !PARSEABLE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `파일 형식 (${mimetype || ext})은 현재 파서가 지원하지 않습니다`,
      errorCode: 'unsupported_type',
      file_id: fileId,
      filename,
      mimetype,
    };
  }

  const url = file.url_private_download || file.url_private;

  try {
    let fileInfo = file;
    if (!url && client && fileId) {
      const resp = await client.files.info({ file: fileId });
      if (resp.ok && resp.file) {
        fileInfo = resp.file;
      }
    }

    const fetchUrl = fileInfo.url_private_download || fileInfo.url_private;
    if (!fetchUrl) {
      return {
        ok: false,
        error: '파일 다운로드 URL을 확인할 수 없습니다',
        errorCode: 'no_download_url',
        file_id: fileId,
        filename,
      };
    }

    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return {
        ok: false,
        error: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다',
        errorCode: 'no_token',
        file_id: fileId,
        filename,
      };
    }

    const response = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return {
          ok: false,
          error: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다',
          errorCode: 'scope_missing',
          file_id: fileId,
          filename,
        };
      }
      return {
        ok: false,
        error: `파일 fetch 실패 (HTTP ${response.status})`,
        errorCode: 'fetch_failed',
        file_id: fileId,
        filename,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);

    if (!text || text.trim().length === 0) {
      return {
        ok: false,
        error: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다',
        errorCode: 'empty_content',
        file_id: fileId,
        filename,
      };
    }

    const MAX_TEXT_LENGTH = 30000;
    const truncated = text.length > MAX_TEXT_LENGTH;
    const extractedText = truncated ? text.slice(0, MAX_TEXT_LENGTH) + '\n...(truncated)' : text;

    return {
      ok: true,
      text: extractedText,
      file_id: fileId,
      filename,
      mimetype: contentType || mimetype,
      truncated,
      char_count: text.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: `파일 인제스트 중 오류: ${err?.message || String(err)}`,
      errorCode: 'ingest_error',
      file_id: fileId,
      filename,
    };
  }
}

/**
 * Build a user-facing error message for file ingest failure.
 */
export function formatFileIngestError(result) {
  const codeMessages = {
    no_file: '파일 정보가 전달되지 않았습니다.',
    no_url: '이 대화 유형(Slack Connect/admin policy)에서 파일 업로드/접근이 제한되어 있습니다.',
    unsupported_type: `파일 형식(${result.mimetype || result.filename})은 현재 파서가 지원하지 않습니다.`,
    no_download_url: '파일 다운로드 URL을 확인할 수 없습니다.',
    no_token: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다.',
    scope_missing: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다.',
    fetch_failed: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다.',
    empty_content: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다.',
    ingest_error: '파일 인제스트 중 오류가 발생했습니다.',
  };

  return codeMessages[result.errorCode] || result.error || '파일 처리 중 알 수 없는 오류가 발생했습니다.';
}
