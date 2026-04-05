/**
 * Slack File Intake — Slack에서 공유된 파일을 인제스트하여
 * 텍스트 추출 후 대화/프로젝트 컨텍스트에 연결.
 *
 * vNext.13.6 — Founder DM MVP: txt/md/csv/json/html/docx + PDF(text layer) + PNG(vision 요약 주입)
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const PARSEABLE_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'html', 'htm', 'js', 'ts', 'py', 'rb', 'sh', 'yaml', 'yml', 'toml',
  'docx',
  'pdf',
  'png',
]);

const BINARY_EXTENSIONS = new Set(['docx', 'pdf', 'png']);

const SUMMARY_MAX = 2000;

function founderFileMaxBytes() {
  const raw = process.env.COS_FOUNDER_FILE_MAX_BYTES;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 15 * 1024 * 1024;
}

/**
 * @param {string} filename
 * @param {string} mimetype
 * @returns {{ ok: true, kind: 'docx'|'pdf'|'png'|'text' } | { ok: false, errorCode: string }}
 */
export function resolveMvpFileKind(filename, mimetype) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const m = String(mimetype || '')
    .toLowerCase()
    .split(';')[0]
    .trim();

  const fromExt =
    ext === 'pdf'
      ? 'pdf'
      : ext === 'png'
        ? 'png'
        : ext === 'docx'
          ? 'docx'
          : PARSEABLE_EXTENSIONS.has(ext) && !['pdf', 'png', 'docx'].includes(ext)
            ? 'text'
            : null;

  const fromMime =
    m === 'application/pdf'
      ? 'pdf'
      : m === 'image/png'
        ? 'png'
        : m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ? 'docx'
          : m.startsWith('text/') || m === 'application/json'
            ? 'text'
            : null;

  if (m === 'application/octet-stream') {
    const k =
      ext === 'pdf'
        ? 'pdf'
        : ext === 'png'
          ? 'png'
          : ext === 'docx'
            ? 'docx'
            : PARSEABLE_EXTENSIONS.has(ext)
              ? 'text'
              : null;
    if (k) return { ok: true, kind: k };
    return { ok: false, errorCode: 'unsupported_type' };
  }

  if (fromMime && fromExt && fromMime !== fromExt) {
    const htmlOk = fromMime === 'text/html' && (ext === 'htm' || ext === 'html');
    if (!htmlOk) return { ok: false, errorCode: 'mime_ext_mismatch' };
  }

  const kind = fromMime || fromExt;
  if (!kind) return { ok: false, errorCode: 'unsupported_type' };
  return { ok: true, kind };
}

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
      'pdf: 텍스트 레이어만 추출 (스캔/이미지 PDF는 본문 없을 수 있음)',
      'png: OpenAI vision 요약(키 필요). 실행·승인과 별도 인테이크 경로.',
      'xlsx/pptx: 현재 미지원 (향후 추가 예정)',
      'Slack Connect 대화에서 외부 조직 파일은 접근이 제한될 수 있음',
    ],
  };
}

async function extractDocxText(buffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    console.warn('[slackFileIntake] docx extraction failed:', err?.message || String(err));
    return '';
  }
}

/**
 * @param {{
 *   buffer: ArrayBuffer | Buffer,
 *   filename: string,
 *   mimetype: string,
 *   summarizePng?: (buf: Buffer) => Promise<{ ok: boolean, text?: string, error?: string }>,
 *   file_id?: string | null,
 *   maxBytes?: number,
 * }} ctx
 */
export async function extractMvpFileFromBuffer(ctx) {
  const {
    buffer,
    filename,
    mimetype,
    summarizePng,
    file_id: fileId = null,
    maxBytes,
  } = ctx || {};
  const fname = filename || 'unknown';
  const mime = mimetype || '';
  const resolved = resolveMvpFileKind(fname, mime);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.errorCode === 'mime_ext_mismatch' ? 'MIME 유형과 확장자가 서로 맞지 않습니다' : `파일 형식 (${mime || fname})은 현재 파서가 지원하지 않습니다`,
      errorCode: resolved.errorCode,
      file_id: fileId,
      filename: fname,
      mimetype: mime,
    };
  }

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const limit = maxBytes ?? founderFileMaxBytes();
  if (buf.length > limit) {
    return {
      ok: false,
      error: `파일이 용량 한도(${limit} bytes)를 초과합니다`,
      errorCode: 'oversized',
      file_id: fileId,
      filename: fname,
      mimetype: mime,
    };
  }

  const { kind } = resolved;
  let text = '';

  try {
    if (kind === 'docx') {
      text = await extractDocxText(buf);
    } else if (kind === 'pdf') {
      const data = await pdfParse(buf);
      text = String(data?.text || '').trim();
      if (!text) {
        return {
          ok: false,
          error: 'PDF에서 추출 가능한 텍스트 레이어가 없습니다 (스캔 PDF 등)',
          errorCode: 'pdf_no_text_layer',
          file_id: fileId,
          filename: fname,
          mimetype: mime || 'application/pdf',
        };
      }
    } else if (kind === 'png') {
      if (typeof summarizePng !== 'function') {
        return {
          ok: false,
          error: 'PNG 요약기가 구성되지 않았습니다',
          errorCode: 'png_summarizer_missing',
          file_id: fileId,
          filename: fname,
          mimetype: mime || 'image/png',
        };
      }
      const vis = await summarizePng(buf);
      if (!vis?.ok) {
        return {
          ok: false,
          error: vis?.error || 'PNG vision 요약 실패',
          errorCode: 'png_vision_failed',
          file_id: fileId,
          filename: fname,
          mimetype: mime || 'image/png',
        };
      }
      text = String(vis.text || '').trim();
    } else {
      text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    }
  } catch (err) {
    return {
      ok: false,
      error: `추출 오류: ${err?.message || String(err)}`,
      errorCode: kind === 'pdf' ? 'pdf_parse_error' : 'extract_error',
      file_id: fileId,
      filename: fname,
      mimetype: mime,
    };
  }

  if (!text || text.trim().length === 0) {
    return {
      ok: false,
      error: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다',
      errorCode: 'empty_content',
      file_id: fileId,
      filename: fname,
      mimetype: mime,
    };
  }

  const MAX_TEXT_LENGTH = 30000;
  const truncated = text.length > MAX_TEXT_LENGTH;
  const extractedText = truncated ? `${text.slice(0, MAX_TEXT_LENGTH)}\n...(truncated)` : text;
  const summary =
    kind === 'png'
      ? extractedText.slice(0, SUMMARY_MAX)
      : extractedText.slice(0, SUMMARY_MAX);

  return {
    ok: true,
    text: extractedText,
    summary,
    file_id: fileId,
    filename: fname,
    mimetype: mime,
    truncated,
    char_count: text.length,
  };
}

/**
 * Fetch and extract text from a Slack file.
 * @param {{ file: object, client: object, summarizePng?: function, maxBytes?: number }} ctx
 * @returns {Promise<{ ok: boolean, text?: string, summary?: string, error?: string, errorCode?: string, file_id?: string, filename?: string, mimetype?: string }>}
 */
export async function ingestSlackFile({ file, client, summarizePng, maxBytes } = {}) {
  if (!file) {
    return { ok: false, error: '파일 정보가 없습니다', errorCode: 'no_file' };
  }

  const fileId = file.id;
  const filename = file.name || file.title || 'unknown';
  const mimetype = file.mimetype || '';
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const kindProbe = resolveMvpFileKind(filename, mimetype);
  if (!kindProbe.ok) {
    return {
      ok: false,
      error:
        kindProbe.errorCode === 'mime_ext_mismatch'
          ? 'MIME 유형과 확장자가 서로 맞지 않습니다'
          : `파일 형식 (${mimetype || ext})은 현재 파서가 지원하지 않습니다`,
      errorCode: kindProbe.errorCode,
      file_id: fileId,
      filename,
      mimetype,
    };
  }

  const declaredSize = Number(file.size);
  const limit = maxBytes ?? founderFileMaxBytes();
  if (Number.isFinite(declaredSize) && declaredSize > limit) {
    return {
      ok: false,
      error: `파일이 용량 한도(${limit} bytes)를 초과합니다`,
      errorCode: 'oversized',
      file_id: fileId,
      filename,
      mimetype,
    };
  }

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

  try {
    let fileInfo = file;
    const fetchUrl0 = file.url_private_download || file.url_private;
    if (!fetchUrl0 && client && fileId) {
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

    return extractMvpFileFromBuffer({
      buffer,
      filename,
      mimetype: contentType || mimetype,
      summarizePng,
      file_id: fileId,
      maxBytes: limit,
    });
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
    mime_ext_mismatch: '파일 MIME 유형과 확장자가 서로 맞지 않아 처리할 수 없습니다.',
    oversized: '파일이 허용 용량을 초과했습니다.',
    pdf_no_text_layer: 'PDF에 선택 가능한 텍스트 레이어가 없습니다. 스캔본이면 OCR 파이프라인이 필요합니다.',
    pdf_parse_error: 'PDF 파싱에 실패했습니다.',
    png_summarizer_missing: 'PNG 요약 경로가 설정되지 않았습니다.',
    png_vision_failed: '이미지 요약(vision)에 실패했습니다. 잠시 후 다시 시도하거나 텍스트로 설명해 주세요.',
    no_download_url: '파일 다운로드 URL을 확인할 수 없습니다.',
    no_token: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다.',
    scope_missing: '앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다.',
    fetch_failed: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다.',
    empty_content: '파일 메타데이터는 확인했지만 본문 추출에 실패했습니다.',
    ingest_error: '파일 인제스트 중 오류가 발생했습니다.',
    extract_error: '파일 내용 추출 중 오류가 발생했습니다.',
  };

  return codeMessages[result.errorCode] || result.error || '파일 처리 중 알 수 없는 오류가 발생했습니다.';
}

/**
 * Log file readiness diagnostics at startup.
 */
export function logFileReadinessDiagnostic() {
  const diag = diagnoseFileReadiness();
  try {
    console.info(
      JSON.stringify({
        event: 'file_readiness_diagnostic',
        ts: new Date().toISOString(),
        ready: diag.ready,
        issues: diag.issues,
        supported_types: diag.supported_types,
        limitations: diag.limitations,
      }),
    );
  } catch {
    /* */
  }
  return diag;
}
