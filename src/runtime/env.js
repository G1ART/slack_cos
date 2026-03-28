const REQUIRED_ENV = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_APP_TOKEN',
  'OPENAI_API_KEY',
];

export function getRuntimeMode() {
  if (process.env.RUNTIME_MODE) return process.env.RUNTIME_MODE;
  if (process.env.NODE_ENV === 'production') return 'hosted';
  return 'local';
}

export function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  return {
    ok: missing.length === 0,
    runtime_mode: getRuntimeMode(),
    missing,
    model: process.env.OPENAI_MODEL || 'gpt-5.4',
    socket_mode: true,
  };
}

/** hosted: Supabase SSOT 필수 (Phase 4) */
export function validateHostedStorageEnv() {
  const runtime = getRuntimeMode();
  if (runtime !== 'hosted') {
    return { ok: true, skipped: true, runtime_mode: runtime };
  }
  const missing = [];
  if (!String(process.env.SUPABASE_URL || '').trim()) missing.push('SUPABASE_URL');
  if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return {
    ok: missing.length === 0,
    missing,
    runtime_mode: runtime,
    storage_mode_effective: process.env.STORAGE_MODE || '(default dual when hosted)',
    read_preference_effective: process.env.STORE_READ_PREFERENCE || '(default supabase when hosted)',
  };
}

/**
 * Slack 이벤트 replay 억제 (`registerHandlers` → `shouldSkipEvent`):
 * - 기본: 프로세스 메모리 Map (단일 워커/프로세스).
 * - 멀티 프로세스: `SLACK_EVENT_DEDUP_FILE` 에 JSON 경로 지정(공유 볼륨 등). 레이스 허용.
 * - 끄기: `SLACK_EVENT_DEDUP_DISABLE=1` 또는 `true`.
 */
export function getSlackEventDedupSummary() {
  const dis = process.env.SLACK_EVENT_DEDUP_DISABLE;
  if (dis === '1' || String(dis).toLowerCase() === 'true') {
    return '끔(SLACK_EVENT_DEDUP_DISABLE)';
  }
  const f = String(process.env.SLACK_EVENT_DEDUP_FILE || '').trim();
  if (f) return `공유파일(${f})`;
  return '메모리(단일프로세스)';
}

export function formatEnvCheck(result) {
  const hostedSt = validateHostedStorageEnv();
  const hostedLine =
    !hostedSt.skipped && hostedSt.ok
      ? '- hosted Supabase: 필수 URL/KEY 존재 (startup에서 연결 확인)'
      : !hostedSt.skipped && !hostedSt.ok
        ? `- hosted Supabase: 누락 ${hostedSt.missing.join(', ')} (배포 전 설정)`
        : null;
  return [
    '환경점검',
    `- runtime_mode: ${result.runtime_mode}`,
    `- model: ${result.model}`,
    `- socket_mode: ${result.socket_mode ? 'true' : 'false'}`,
    `- 필수 env 누락: ${result.missing.length ? result.missing.join(', ') : '없음'}`,
    `- 상태: ${result.ok ? '정상' : '누락 있음'}`,
    `- slack_event_dedup: ${getSlackEventDedupSummary()}`,
    ...(hostedLine ? [hostedLine] : []),
  ].join('\n');
}
