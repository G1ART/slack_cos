/**
 * Founder 응답: transport blob 제거 후 Slack 송신 + 해시 로그만. 대화 본문은 검사하지 않는다.
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

/**
 * @param {{
 *   say?: import('@slack/bolt').SayFn,
 *   client?: import('@slack/web-api').WebClient,
 *   channel?: string,
 *   thread_ts?: string,
 *   text: string,
 *   constitutionSha256: string,
 * }} opts
 */
export async function sendFounderResponse(opts) {
  let text = stripTransportJsonBlobs(String(opts.text || '')).trim();
  if (!text) {
    const err = new Error('founder_empty_response_after_transport_strip');
    err.code = 'founder_empty_response';
    throw err;
  }

  console.info(
    JSON.stringify({
      stage: 'founder_outbound',
      constitution_sha256: opts.constitutionSha256,
      response_sha256: sha256(text),
      preview: text.slice(0, 240),
    }),
  );

  const { say, client, channel, thread_ts } = opts;
  if (say) {
    if (thread_ts) await say({ text, thread_ts });
    else await say(text);
  } else if (client && channel) {
    await client.chat.postMessage({
      channel,
      text,
      ...(thread_ts ? { thread_ts } : {}),
    });
  } else {
    const err = new Error('founder_outbound_missing_say_or_client');
    err.code = 'founder_outbound_missing_transport';
    throw err;
  }

  return text;
}
