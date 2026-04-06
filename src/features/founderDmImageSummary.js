/**
 * vNext.13.6+ — Founder DM 이미지(PNG/JPEG/WebP 등): vision 요약 (실행/승인과 분리된 인테이크).
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * @param {Buffer} buf
 * @returns {string} data URL for OpenAI image_url
 */
function bufferToVisionDataUrl(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) {
    return `data:image/jpeg;base64,${b.toString('base64')}`;
  }
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return `data:image/webp;base64,${b.toString('base64')}`;
  }
  return `data:image/png;base64,${b.toString('base64')}`;
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
export async function summarizePngBufferForFounderDm(buffer) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, error: 'OPENAI_API_KEY 없음' };
  }
  const model = String(process.env.COS_FOUNDER_IMAGE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const openai = new OpenAI({ apiKey: key });
  const url = bufferToVisionDataUrl(buffer);
  try {
    const resp = await openai.chat.completions.create({
      model,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '당신은 COS 비서다. 창업자가 Slack DM에 올린 이미지다. 한국어로, 과장 없이 5문장 이내로 핵심 시각 요소를 요약하라. 문서/슬라이드로 보이면 짧게만 짐작하라. 완벽한 OCR을 시도하지 말 것.',
            },
            { type: 'image_url', image_url: { url } },
          ],
        },
      ],
    });
    const t = resp.choices?.[0]?.message?.content?.trim();
    if (!t) return { ok: false, error: 'empty vision response' };
    return { ok: true, text: t };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
