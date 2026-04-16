/**
 * 현재 턴 Slack 첨부만 읽어 요약 텍스트로 만든다. 상태 병합·영속화 없음.
 *
 * Slack 이벤트의 `files[]` 객체를 우선 사용하고, `files.info`는
 * `check_file_info`·URL 누락·핵심 메타 부족 시에만 호출한다.
 *
 * 비공개 파일 바이트는 `downloadSlackPrivateFile`로 가져오며, 리다이렉트마다
 * Bearer를 재부착하고 HTML/미리보기 응답은 성공으로 처리하지 않는다.
 */

import mammoth from 'mammoth';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const HTML_FAILURE_REASON = '파일 대신 HTML 미리보기/로그인 페이지가 내려와 읽지 못했습니다.';

/** @typedef {'url_private_download' | 'url_private'} SlackPrivateUrlVariant */

/**
 * 리다이렉트 따라가기 허용 호스트 (Slack 파일·워크스페이스 경로).
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedSlackRedirectHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'files.slack.com') return true;
  if (h === 'slack-files.com' || h.endsWith('.slack-files.com')) return true;
  if (h.endsWith('.slack.com')) {
    if (h === 'app.slack.com' || h === 'www.slack.com' || h === 'slack.com') return false;
    if (h.startsWith('files')) return true;
    if (/^[a-z0-9][a-z0-9-]*\.slack\.com$/.test(h)) return true;
  }
  return false;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function slackFinalUrlLooksLikePreviewPage(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'app.slack.com') return true;
    if (u.hostname.endsWith('.slack.com') && u.pathname.includes('/client/') && u.pathname.includes('/files')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} file
 * @returns {{ url: string, variant: SlackPrivateUrlVariant } | null}
 */
export function pickSlackPrivateFileUrl(file) {
  const udl = String(file.url_private_download || '').trim();
  const up = String(file.url_private || '').trim();
  if (udl) return { url: udl, variant: 'url_private_download' };
  if (up) return { url: up, variant: 'url_private' };
  return null;
}

/**
 * `files.info` 후속 조회가 필요한지 (이벤트 페이로드만으로는 불충분한 경우).
 * @param {Record<string, unknown> | null | undefined} fileLike
 * @returns {boolean}
 */
export function needsSlackFileInfoLookup(fileLike) {
  if (!fileLike || typeof fileLike !== 'object') return true;
  if (fileLike.file_access === 'check_file_info') return true;
  const udl = String(fileLike.url_private_download || '').trim();
  const up = String(fileLike.url_private || '').trim();
  if (!udl && !up) return true;
  const nm = String(fileLike.name || '').trim();
  const ti = String(fileLike.title || '').trim();
  const mime = String(fileLike.mimetype || '').trim();
  if (!nm && !ti && !mime) return true;
  return false;
}

/**
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   fileLike: Record<string, unknown>,
 * }} p
 * @returns {Promise<
 *   | { ok: true, file: Record<string, unknown>, source: 'event_payload' | 'files.info' }
 *   | { ok: false, reason: string, code?: string, source: 'files.info' }
 * >}
 */
export async function resolveSlackFileObject({ client, fileLike }) {
  if (!needsSlackFileInfoLookup(fileLike)) {
    return { ok: true, file: fileLike, source: 'event_payload' };
  }
  const id = fileLike?.id;
  if (!id) {
    return {
      ok: false,
      reason: '파일 ID가 없어 Slack에서 메타데이터를 조회하지 못했습니다.',
      code: 'missing_file_id',
      source: 'files.info',
    };
  }
  try {
    const info = await client.files.info({ file: id });
    const file = info?.file;
    if (file && typeof file === 'object') {
      return { ok: true, file: /** @type {Record<string, unknown>} */ (file), source: 'files.info' };
    }
    return {
      ok: false,
      reason: 'Slack에서 파일 정보를 가져오지 못했습니다.',
      code: 'empty_file_in_response',
      source: 'files.info',
    };
  } catch (e) {
    const slack_error = e?.data?.error ?? e?.message ?? String(e);
    const isConnect = fileLike?.file_access === 'check_file_info';
    const reason = isConnect
      ? 'Slack Connect 파일 메타데이터 조회에 실패했습니다.'
      : 'Slack에서 파일 정보를 가져오지 못했습니다.';
    console.error(
      JSON.stringify({
        event: 'attachment_file_info_lookup_failed',
        file_id: id,
        file_access: fileLike?.file_access ?? null,
        slack_error,
        source: 'files.info',
      }),
    );
    return { ok: false, reason, code: String(slack_error), source: 'files.info' };
  }
}

/**
 * @param {Buffer} buf
 */
function bufferLooksLikeHtml(buf) {
  const n = Math.min(4096, buf.length);
  if (n === 0) return false;
  let s;
  try {
    s = buf.slice(0, n).toString('utf8').replace(/^\ufeff/, '').trimStart().toLowerCase();
  } catch {
    return false;
  }
  if (s.startsWith('<!doctype html') || s.startsWith('<html')) return true;
  if (s.includes('<html') && s.length < 800) return true;
  if (buf.length < 512) {
    const low = s.slice(0, 256);
    if (low.includes('<!doctype') || low.includes('<html') || low.includes('<head')) return true;
  }
  return false;
}

/**
 * Slack 비공개 파일 URL을 수동 리다이렉트·Bearer 유지로 다운로드한다.
 * @param {{
 *   client: { token?: string },
 *   url: string,
 *   maxRedirects?: number,
 *   urlVariant: SlackPrivateUrlVariant,
 * }} p
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       buffer: Buffer,
 *       contentType: string,
 *       finalUrl: string,
 *       diagnostics: Record<string, unknown>,
 *     }
 *   | { ok: false, reason: string, code: string, diagnostics: Record<string, unknown> }
 * >}
 */
export async function downloadSlackPrivateFile({ client, url, maxRedirects = 5, urlVariant }) {
  const token = client?.token || process.env.SLACK_BOT_TOKEN;
  /** @type {Record<string, unknown>} */
  const diagnostics = {
    url_variant_used: urlVariant,
    redirect_count: 0,
    initial_host: '',
    final_host: '',
    final_status: null,
    final_content_type: null,
    content_disposition: null,
    html_detected: false,
  };

  let initialHost = '';
  try {
    initialHost = new URL(url).hostname;
  } catch {
    return {
      ok: false,
      reason: '다운로드 URL이 올바르지 않습니다.',
      code: 'attachment_download_fetch_error',
      diagnostics: { ...diagnostics, initial_host: initialHost },
    };
  }
  diagnostics.initial_host = initialHost;
  if (!isAllowedSlackRedirectHost(initialHost)) {
    return {
      ok: false,
      reason: '허용되지 않은 호스트의 비공개 파일 URL입니다.',
      code: 'attachment_download_disallowed_redirect_host',
      diagnostics: { ...diagnostics, disallowed_host: initialHost },
    };
  }

  let currentUrl = url;
  let redirectCount = 0;
  const authHeaders = { Authorization: `Bearer ${token}` };

  for (;;) {
    let res;
    try {
      res = await fetch(currentUrl, { method: 'GET', headers: { ...authHeaders }, redirect: 'manual' });
    } catch {
      return {
        ok: false,
        reason: '네트워크 오류로 다운로드하지 못했습니다.',
        code: 'attachment_download_fetch_error',
        diagnostics: { ...diagnostics, redirect_count: redirectCount },
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return {
          ok: false,
          reason: `다운로드 실패 (HTTP ${res.status}, Location 없음)`,
          code: 'attachment_download_http_error',
          diagnostics: { ...diagnostics, redirect_count: redirectCount, final_status: res.status },
        };
      }
      if (redirectCount >= maxRedirects) {
        return {
          ok: false,
          reason: `리다이렉트가 ${maxRedirects}회를 넘어 중단했습니다.`,
          code: 'attachment_download_redirect_limit',
          diagnostics: { ...diagnostics, redirect_count: redirectCount },
        };
      }
      let nextUrl;
      try {
        nextUrl = new URL(loc, currentUrl).href;
      } catch {
        return {
          ok: false,
          reason: '리다이렉트 URL을 해석하지 못했습니다.',
          code: 'attachment_download_fetch_error',
          diagnostics: { ...diagnostics, redirect_count: redirectCount },
        };
      }
      let nextHost = '';
      try {
        nextHost = new URL(nextUrl).hostname;
      } catch {
        return {
          ok: false,
          reason: '리다이렉트 URL이 올바르지 않습니다.',
          code: 'attachment_download_fetch_error',
          diagnostics: { ...diagnostics, redirect_count: redirectCount },
        };
      }
      if (!isAllowedSlackRedirectHost(nextHost)) {
        return {
          ok: false,
          reason: `허용되지 않은 호스트로의 리다이렉트입니다: ${nextHost}`,
          code: 'attachment_download_disallowed_redirect_host',
          diagnostics: { ...diagnostics, redirect_count: redirectCount, disallowed_host: nextHost },
        };
      }
      redirectCount += 1;
      diagnostics.redirect_count = redirectCount;
      currentUrl = nextUrl;
      continue;
    }

    const finalStatus = res.status;
    diagnostics.final_status = finalStatus;
    const rawCt = res.headers.get('content-type') || '';
    const cd = res.headers.get('content-disposition') || '';
    diagnostics.final_content_type = rawCt;
    diagnostics.content_disposition = cd;
    const finalUrl = res.url || currentUrl;
    let finalHost = '';
    try {
      finalHost = new URL(finalUrl).hostname;
    } catch {
      /* keep empty */
    }
    diagnostics.final_host = finalHost;

    if (!isAllowedSlackRedirectHost(finalHost)) {
      return {
        ok: false,
        reason: `응답 호스트가 허용 범위를 벗어났습니다: ${finalHost || '(알 수 없음)'}`,
        code: 'attachment_download_disallowed_redirect_host',
        diagnostics,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        reason: `다운로드 실패 (HTTP ${finalStatus})`,
        code: 'attachment_download_http_error',
        diagnostics,
      };
    }

    if (slackFinalUrlLooksLikePreviewPage(finalUrl)) {
      diagnostics.html_detected = true;
      return {
        ok: false,
        reason: HTML_FAILURE_REASON,
        code: 'attachment_download_received_html',
        diagnostics,
      };
    }

    const contentType = rawCt.toLowerCase().split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());

    if (contentType === 'text/html' || contentType.endsWith('/html') || rawCt.toLowerCase().includes('text/html')) {
      diagnostics.html_detected = true;
      return {
        ok: false,
        reason: HTML_FAILURE_REASON,
        code: 'attachment_download_received_html',
        diagnostics,
      };
    }

    if (bufferLooksLikeHtml(buf)) {
      diagnostics.html_detected = true;
      return {
        ok: false,
        reason: HTML_FAILURE_REASON,
        code: 'attachment_download_received_html',
        diagnostics,
      };
    }

    return {
      ok: true,
      buffer: buf,
      contentType: contentType || 'application/octet-stream',
      finalUrl,
      diagnostics: {
        ...diagnostics,
        redirect_count: redirectCount,
        final_host: finalHost,
        final_status: finalStatus,
      },
    };
  }
}

/**
 * @param {{ token?: string }} client
 * @param {string} url
 * @returns {Promise<
 *   | { ok: true, buffer: Buffer, contentType: string, finalUrl: string }
 *   | { ok: false, reason: string, code: string }
 * >}
 */
export async function downloadPrivateUrl(client, url) {
  const r = await downloadSlackPrivateFile({
    client,
    url,
    maxRedirects: 5,
    urlVariant: 'url_private',
  });
  if (!r.ok) return { ok: false, reason: r.reason, code: r.code };
  return { ok: true, buffer: r.buffer, contentType: r.contentType, finalUrl: r.finalUrl };
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractPdfTextBuffer(buffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const res = await pdfParse(buffer);
  return String(res?.text || '').trim();
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractDocxTextBuffer(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return String(value || '').trim();
}

/**
 * @param {import('openai').default} openai
 * @param {string} visionModel
 * @param {Buffer} buffer
 * @param {string} mime
 */
export async function summarizeImageBuffer(openai, visionModel, buffer, mime) {
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  const res = await openai.chat.completions.create({
    model: visionModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '이 이미지를 한국어로 한 단락으로 요약하라. 불필요한 메타 설명은 하지 마라.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 500,
  });
  const t = res.choices?.[0]?.message?.content;
  return String(t || '').trim();
}

/**
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   files: object[],
 *   openai: import('openai').default,
 *   model: string,
 *   visionModel?: string,
 * }} ctx
 * @returns {Promise<{ filename: string, ok: boolean, summary?: string, reason?: string }[]>}
 */
export async function ingestCurrentTurnAttachments(ctx) {
  const { client, files, openai, model } = ctx;
  const visionModel = ctx.visionModel || process.env.OPENAI_VISION_MODEL || 'gpt-4o';
  const list = Array.isArray(files) ? files : [];
  const out = [];

  for (const f of list) {
    const rawF = f && typeof f === 'object' && !Array.isArray(f) ? /** @type {Record<string, unknown>} */ (f) : {};
    const name = String(rawF.name || rawF.title || '첨부').trim() || '첨부';
    const id = rawF.id;
    if (!id) {
      out.push({ filename: name, ok: false, reason: '파일 ID가 없어 읽지 못했습니다.' });
      continue;
    }

    const resolved = await resolveSlackFileObject({ client, fileLike: rawF });
    if (!resolved.ok) {
      out.push({ filename: name, ok: false, reason: resolved.reason || 'Slack에서 파일 정보를 가져오지 못했습니다.' });
      continue;
    }

    let file = resolved.file;
    const pick0 = pickSlackPrivateFileUrl(file);
    if (!pick0) {
      out.push({ filename: name, ok: false, reason: '비공개 다운로드 URL이 없어 읽지 못했습니다.' });
      console.info(
        JSON.stringify({
          event: 'attachment_slack_download_attempt',
          file_id: id,
          filename: name,
          failure_code: 'attachment_download_missing_private_url',
          used_files_info_fallback: resolved.source === 'files.info',
          file_access: rawF.file_access ?? null,
        }),
      );
      continue;
    }
    let pickUsed = pick0;

    let dl = await downloadSlackPrivateFile({
      client,
      url: pickUsed.url,
      maxRedirects: 5,
      urlVariant: pickUsed.variant,
    });
    const source = resolved.source;

    if (
      !dl.ok &&
      dl.code === 'attachment_download_http_error' &&
      source === 'event_payload' &&
      /\b401\b|\b403\b/.test(String(dl.reason || ''))
    ) {
      console.info(
        JSON.stringify({
          event: 'attachment_download_retry_via_files_info',
          file_id: id,
          first_reason: dl.reason || null,
          first_failure_code: dl.code,
        }),
      );
      try {
        const info = await client.files.info({ file: id });
        const refreshed = info?.file && typeof info.file === 'object' ? info.file : null;
        if (refreshed) {
          const pick1 = pickSlackPrivateFileUrl(/** @type {Record<string, unknown>} */ (refreshed));
          if (pick1) {
            const dl2 = await downloadSlackPrivateFile({
              client,
              url: pick1.url,
              maxRedirects: 5,
              urlVariant: pick1.variant,
            });
            if (dl2.ok) {
              dl = dl2;
              file = /** @type {Record<string, unknown>} */ (refreshed);
              pickUsed = pick1;
            }
          }
        }
      } catch {
        /* keep first dl failure */
      }
    }

    const diagBase = {
      event: 'attachment_slack_download_attempt',
      file_id: id,
      filename: name,
      url_variant_used: pickUsed.variant,
      used_files_info_fallback: resolved.source === 'files.info',
      file_access: rawF.file_access ?? null,
    };
    if (!dl.ok) {
      console.info(
        JSON.stringify({
          ...diagBase,
          ...(dl.diagnostics || {}),
          failure_code: dl.code,
        }),
      );
      out.push({ filename: name, ok: false, reason: dl.reason || '다운로드에 실패했습니다.' });
      continue;
    }

    console.info(
      JSON.stringify({
        ...diagBase,
        ...(dl.diagnostics || {}),
        failure_code: null,
        html_detected: Boolean(dl.diagnostics?.html_detected === true),
      }),
    );

    const buffer = dl.buffer;
    const mime = String((file.mimetype || rawF.mimetype) || '').toLowerCase();
    const fname = String((file.name || rawF.name || file.title || rawF.title || name) || '').toLowerCase();

    try {
      if (mime.startsWith('image/') || IMAGE_EXT.test(fname)) {
        const m = mime || 'image/png';
        const summary = await summarizeImageBuffer(openai, visionModel, buffer, m);
        if (!summary) {
          out.push({ filename: name, ok: false, reason: '이미지 내용을 요약하지 못했습니다.' });
        } else {
          out.push({ filename: name, ok: true, summary });
        }
        continue;
      }

      if (mime === 'application/pdf' || fname.endsWith('.pdf')) {
        const raw = await extractPdfTextBuffer(buffer);
        if (!raw) {
          out.push({ filename: name, ok: false, reason: 'PDF에서 텍스트를 추출하지 못했습니다.' });
        } else {
          out.push({ filename: name, ok: true, summary: raw.slice(0, 12000) });
        }
        continue;
      }

      if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fname.endsWith('.docx')
      ) {
        const raw = await extractDocxTextBuffer(buffer);
        if (!raw) {
          out.push({ filename: name, ok: false, reason: 'DOCX에서 텍스트를 추출하지 못했습니다.' });
        } else {
          out.push({ filename: name, ok: true, summary: raw.slice(0, 12000) });
        }
        continue;
      }

      out.push({
        filename: name,
        ok: false,
        reason: '지원하지 않는 형식입니다. PNG, JPG, WEBP, DOCX, PDF만 처리합니다.',
      });
    } catch {
      out.push({ filename: name, ok: false, reason: '파일을 읽는 중 오류가 났습니다.' });
    }
  }

  return out;
}
