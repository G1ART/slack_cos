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

/**
 * Build normalized deploy packet for Vercel.
 */
export function buildVercelDeployPacket(space, run) {
  const diag = diagnoseVercelReadiness();
  const hasProject = Boolean(space?.vercel_project_id);
  const readiness = diag.configured && hasProject ? 'configured' : 'manual_required';
  return {
    provider: 'vercel',
    readiness,
    manual_required: !diag.configured || !hasProject,
    env_required: diag.missing,
    project_linkage: space?.vercel_project_id || null,
    project_url: space?.vercel_project_url || null,
    exact_next_step: readiness === 'configured'
      ? 'git push 후 자동 배포 또는 Vercel dashboard에서 수동 트리거'
      : !diag.configured
        ? `VERCEL_TOKEN 환경변수 설정 후 프로젝트 연결`
        : 'Vercel 프로젝트 생성/연결 후 vercel_project_id를 project space에 등록',
    result_update_path: `project space ${space?.project_id} 또는 data/deploy-results/${run?.run_id || 'unknown'}.json`,
    live_create_supported: false,
  };
}
