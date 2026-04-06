/**
 * Founder 응답을 Slack으로만 보낸다. 생성·치환·포맷터 없음. 위반이면 throw.
 */

import crypto from 'node:crypto';

/** @param {string} md */
export function parseForbiddenPhrasesFromConstitution(md) {
  const anchor = '## 6.1 founder 경로에서 금지되는 것';
  const start = md.indexOf(anchor);
  if (start === -1) return [];
  const rest = md.slice(start);
  const next = rest.indexOf('\n## ', anchor.length);
  const section = next === -1 ? rest : rest.slice(0, next);
  const out = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out.filter(Boolean);
}

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
 * @param {string} text
 * @param {string[]} forbidden
 * @returns {string|null}
 */
export function findForbiddenInText(text, forbidden) {
  const t = String(text || '');
  for (const f of forbidden) {
    if (f && t.includes(f)) return f;
  }
  return null;
}

/**
 * @param {{
 *   say?: import('@slack/bolt').SayFn,
 *   client?: import('@slack/web-api').WebClient,
 *   channel?: string,
 *   thread_ts?: string,
 *   text: string,
 *   constitutionSha256: string,
 *   forbiddenPhrases: string[],
 *   skipForbiddenCheck?: boolean,
 * }} opts
 */
export async function sendFounderResponse(opts) {
  let text = stripTransportJsonBlobs(String(opts.text || '')).trim();
  if (!text) {
    const err = new Error('founder_empty_response_after_transport_strip');
    err.code = 'founder_empty_response';
    throw err;
  }

  if (!opts.skipForbiddenCheck) {
    const hit = findForbiddenInText(text, opts.forbiddenPhrases || []);
    if (hit) {
      const err = new Error(`founder_forbidden_substring: ${hit}`);
      err.code = 'founder_forbidden_substring';
      err.forbidden = hit;
      throw err;
    }
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
