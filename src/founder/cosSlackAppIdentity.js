/**
 * Slack 앱 정체성 (에픽 3 — 멀티 Slack 앱 B 전제).
 * 오늘은 프로세스당 Bolt `App` 하나; 나중에 앱별로 프로세스·토큰을 쪼갤 때 이 값으로 감사·라우팅 경계를 맞춘다.
 *
 * Slack API 앱 관리 화면의 App ID (보통 `A` + 영숫자). 비우면 미설정.
 */

export const COS_SLACK_APP_ID_ENV = 'COS_SLACK_APP_ID';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} 비어 있으면 ''
 */
export function slackAppIdFromEnv(env = process.env) {
  const raw = String(env[COS_SLACK_APP_ID_ENV] || '').trim();
  if (!raw) return '';
  const safe = raw.replace(/[^A-Za-z0-9]+/g, '').slice(0, 32);
  return safe || '';
}
