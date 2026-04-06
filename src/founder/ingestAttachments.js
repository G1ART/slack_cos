/**
 * 현재 턴 Slack 첨부만 읽어 요약 텍스트로 만든다. 상태 병합·영속화 없음.
 * HTTP 200 + HTML(미리보기/로그인) 은 바이너리로 처리하지 않는다.
 */

import mammoth from 'mammoth';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const HTML_FAILURE_REASON = '파일 대신 HTML 미리보기/로그인 페이지가 내려와 읽지 못했습니다.';

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
 * @param {{ token?: string }} client
 * @param {string} url
 * @returns {Promise<
 *   | { ok: true, buffer: Buffer, contentType: string, finalUrl: string }
 *   | { ok: false, reason: string, code: string }
 * >}
 */
export async function downloadPrivateUrl(client, url) {
  const token = client?.token || process.env.SLACK_BOT_TOKEN;
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: '네트워크 오류로 다운로드하지 못했습니다.', code: 'fetch_error' };
  }

  const finalUrl = res.url || url;
  if (!res.ok) {
    return { ok: false, reason: `다운로드 실패 (HTTP ${res.status})`, code: 'http_error' };
  }

  const rawCt = res.headers.get('content-type') || '';
  const contentType = rawCt.toLowerCase().split(';')[0].trim();

  const buf = Buffer.from(await res.arrayBuffer());

  if (contentType === 'text/html' || contentType.endsWith('/html') || rawCt.toLowerCase().includes('text/html')) {
    return { ok: false, reason: HTML_FAILURE_REASON, code: 'html_instead_of_binary' };
  }

  if (bufferLooksLikeHtml(buf)) {
    return { ok: false, reason: HTML_FAILURE_REASON, code: 'html_instead_of_binary' };
  }

  return {
    ok: true,
    buffer: buf,
    contentType: contentType || 'application/octet-stream',
    finalUrl,
  };
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
    const id = f?.id;
    const name = String(f?.name || f?.title || '첨부').trim() || '첨부';
    if (!id) {
      out.push({ filename: name, ok: false, reason: '파일 ID가 없어 읽지 못했습니다.' });
      continue;
    }

    let info;
    try {
      info = await client.files.info({ file: id });
    } catch {
      out.push({ filename: name, ok: false, reason: 'Slack에서 파일 정보를 가져오지 못했습니다.' });
      continue;
    }

    const file = info?.file;
    const fileUrl = file?.url_private_download || file?.url_private;
    if (!fileUrl) {
      out.push({ filename: name, ok: false, reason: '비공개 다운로드 URL이 없어 읽지 못했습니다.' });
      continue;
    }

    const dl = await downloadPrivateUrl(client, fileUrl);
    if (!dl.ok) {
      out.push({ filename: name, ok: false, reason: dl.reason || '다운로드에 실패했습니다.' });
      continue;
    }

    const buffer = dl.buffer;
    const mime = String(file.mimetype || '').toLowerCase();
    const fname = String(file.name || name).toLowerCase();

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
