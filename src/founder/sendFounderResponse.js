/**
 * Founder 응답: transport blob 제거 후 Slack 송신 + 해시 로그. 성공 여부를 caller에 반환.
 */

import crypto from 'node:crypto';

function stripTransportJsonBlobs(s) {
  return String(s || '')
    .replace(/\{\s*"detail"\s*:\s*"[^"]*"\s*\}/g, '')
    .replace(/\{\s*"detail"\s*:\s*'[^']*'\s*\}/g, '')
    .replace(/\{\s*"detail"\s*:\s*[^}]+\}/g, '');
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

/** Slack chat.postMessage text 상한에 맞춰 분할 (여유 38k). */
const SLACK_TEXT_CHUNK_CHARS = 38_000;

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function chunkFounderSlackText(raw) {
  const text = stripTransportJsonBlobs(String(raw || '')).trim();
  if (!text) return [];
  if (text.length <= SLACK_TEXT_CHUNK_CHARS) return [text];
  const parts = [];
  for (let i = 0; i < text.length; i += SLACK_TEXT_CHUNK_CHARS) {
    parts.push(text.slice(i, i + SLACK_TEXT_CHUNK_CHARS));
  }
  return parts;
}

/**
 * @param {{
 *   say?: import('@slack/bolt').SayFn,
 *   client?: import('@slack/web-api').WebClient,
 *   channel?: string,
 *   thread_ts?: string,
 *   text: string,
 *   constitutionSha256: string,
 * }} opts
 * @returns {Promise<{ ok: true, text: string } | { ok: false, text: string, error: string }>}
 */
export async function sendFounderResponse(opts) {
  const chunks = chunkFounderSlackText(String(opts.text || ''));
  if (!chunks.length) {
    const err = new Error('founder_empty_response_after_transport_strip');
    err.code = 'founder_empty_response';
    throw err;
  }
  const fullText = chunks.join('');

  console.info(
    JSON.stringify({
      stage: 'founder_outbound',
      constitution_sha256: opts.constitutionSha256,
      response_sha256: sha256(fullText),
      chunk_count: chunks.length,
      preview: fullText.slice(0, 240),
    }),
  );

  const { say, client, channel, thread_ts } = opts;
  try {
    for (let i = 0; i < chunks.length; i += 1) {
      const piece = chunks[i];
      if (say) {
        if (thread_ts) await say({ text: piece, thread_ts });
        else await say(piece);
      } else if (client && channel) {
        await client.chat.postMessage({
          channel,
          text: piece,
          ...(thread_ts ? { thread_ts } : {}),
        });
      } else {
        const err = new Error('founder_outbound_missing_say_or_client');
        err.code = 'founder_outbound_missing_transport';
        throw err;
      }
    }
    return { ok: true, text: fullText };
  } catch (e) {
    console.error('[founder_outbound]', e);
    return { ok: false, text: fullText, error: String(e?.message || e) };
  }
}
