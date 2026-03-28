/**
 * Slack 핸들러·플래너 등에서 사용자/로그용 짧은 오류 문자열.
 */
export function formatError(error) {
  if (!error) return 'Unknown error';

  return [
    error.name ? `name=${error.name}` : null,
    error.status ? `status=${error.status}` : null,
    error.code ? `code=${error.code}` : null,
    error.message ? `message=${error.message}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}
