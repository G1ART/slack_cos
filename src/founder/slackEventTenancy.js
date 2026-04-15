/**
 * Slack 이벤트에서 워크스페이스 식별자 추출 (멀티워크스페이스 관측·향후 workspace_key 후보).
 * 값은 Slack Team ID 형태가 일반적이며 비밀이 아니나, 로그에는 필요 시에만 포함한다.
 */

/**
 * @param {Record<string, unknown> | null | undefined} event
 * @returns {string} 비어 있으면 ''
 */
export function slackTeamIdFromEvent(event) {
  const e = event && typeof event === 'object' && !Array.isArray(event) ? event : {};
  const a = e.team != null ? String(e.team).trim() : '';
  if (a) return a;
  const b = e.team_id != null ? String(e.team_id).trim() : '';
  return b || '';
}

/**
 * Slack Team ID를 workspace_key 후보로 정규화.
 * @param {string | null | undefined} teamId
 * @returns {string}
 */
export function workspaceKeyFromSlackTeamId(teamId) {
  const t = String(teamId || '').trim();
  if (!t) return '';
  return (
    t
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) || ''
  );
}
