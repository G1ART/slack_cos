/**
 * 현재 턴 Slack 첨부만 읽어 요약 텍스트로 만든다. 상태 병합·영속화 없음.
 */

import mammoth from 'mammoth';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

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
 * @param {{ token?: string }} client Slack WebClient (Bolt)
 * @param {string} url
 */
async function downloadPrivateUrl(client, url) {
  const token = client?.token || process.env.SLACK_BOT_TOKEN;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, reason: `다운로드 실패 (HTTP ${res.status})` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, buffer: buf };
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
    const url = file?.url_private_download || file?.url_private;
    if (!url) {
      out.push({ filename: name, ok: false, reason: '비공개 다운로드 URL이 없어 읽지 못했습니다.' });
      continue;
    }

    const dl = await downloadPrivateUrl(client, url);
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
