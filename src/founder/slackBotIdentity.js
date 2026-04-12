/**
 * 봇 user id 캐시 — 스레드 후속 메시지 vs app_mention 중복 처리에 사용.
 */

/** @type {string | null} */
let cachedBotUserId = null;

/**
 * @param {import('@slack/web-api').WebClient | null | undefined} client
 * @returns {Promise<string | null>}
 */
export async function getSlackBotUserId(client) {
  if (cachedBotUserId) return cachedBotUserId;
  const fromEnv = String(process.env.SLACK_BOT_USER_ID || '').trim();
  if (fromEnv) {
    cachedBotUserId = fromEnv;
    return fromEnv;
  }
  const token = String(process.env.SLACK_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const c = client && typeof client.auth?.test === 'function' ? client : null;
    if (c) {
      const r = await c.auth.test({ token });
      const uid = r?.user_id != null ? String(r.user_id).trim() : '';
      if (uid) {
        cachedBotUserId = uid;
        return cachedBotUserId;
      }
    }
  } catch (e) {
    console.error('[slack_bot_user_id]', e);
  }
  return null;
}

/** 테스트 전용 */
export function __resetSlackBotUserIdCacheForTests() {
  cachedBotUserId = null;
}
