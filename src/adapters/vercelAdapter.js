/**
 * Vercel Adapter — draft-first bootstrap + readiness diagnostic.
 *
 * live API create는 이번 패치에서 미구현. draft/manual bootstrap만 지원.
 */

export function diagnoseVercelReadiness() {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID || null;
  const missing = [];
  if (!token) missing.push('VERCEL_TOKEN');
  return {
    configured: missing.length === 0,
    mode: token ? 'live_draft' : 'manual_only',
    team_id: teamId,
    missing,
  };
}

export function buildVercelBootstrapDraft(space) {
  const diag = diagnoseVercelReadiness();
  return {
    provider: 'vercel',
    project_id: space?.project_id || null,
    human_label: space?.human_label || '',
    configured: diag.configured,
    draft_instructions: [
      '1. https://vercel.com/new 에서 프로젝트 생성',
      space?.repo_owner && space?.repo_name
        ? `2. GitHub repo 연결: ${space.repo_owner}/${space.repo_name}`
        : '2. GitHub repo 연결 (repo 미지정 상태)',
      '3. Framework preset 선택 (Next.js / Vite 등)',
      '4. 환경변수 설정: VERCEL_TOKEN, VERCEL_PROJECT_ID',
      '5. project space에 vercel_project_id / vercel_project_url 업데이트',
    ],
    env_required: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'],
    manual_required: !diag.configured,
    live_create_supported: false,
  };
}

export function buildVercelManualInstructions(space) {
  const draft = buildVercelBootstrapDraft(space);
  return {
    ...draft,
    result_drop_note: 'Vercel 프로젝트 연결 후 project space를 업데이트해주세요.',
  };
}
