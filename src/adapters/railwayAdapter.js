/**
 * Railway Adapter — draft-first bootstrap + readiness diagnostic.
 *
 * live API create는 이번 패치에서 미구현. draft/manual bootstrap만 지원.
 */

export function diagnoseRailwayReadiness() {
  const token = process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN;
  const missing = [];
  if (!token) missing.push('RAILWAY_TOKEN');
  return {
    configured: missing.length === 0,
    mode: token ? 'live_draft' : 'manual_only',
    missing,
  };
}

export function buildRailwayBootstrapDraft(space) {
  const diag = diagnoseRailwayReadiness();
  return {
    provider: 'railway',
    project_id: space?.project_id || null,
    human_label: space?.human_label || '',
    configured: diag.configured,
    draft_instructions: [
      '1. https://railway.app/new 에서 프로젝트 생성',
      space?.repo_owner && space?.repo_name
        ? `2. GitHub repo 연결: ${space.repo_owner}/${space.repo_name}`
        : '2. GitHub repo 연결 (repo 미지정 상태)',
      '3. 서비스 추가 (Node.js / Docker 등)',
      '4. 환경변수 설정: RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID',
      '5. project space에 railway_project_id / railway_service_id 업데이트',
    ],
    env_required: ['RAILWAY_TOKEN', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'],
    manual_required: !diag.configured,
    live_create_supported: false,
  };
}

export function buildRailwayManualInstructions(space) {
  const draft = buildRailwayBootstrapDraft(space);
  return {
    ...draft,
    result_drop_note: 'Railway 프로젝트 연결 후 project space를 업데이트해주세요.',
  };
}

/**
 * Build normalized deploy packet for Railway.
 */
export function buildRailwayDeployPacket(space, run) {
  const diag = diagnoseRailwayReadiness();
  const hasService = Boolean(space?.railway_service_id || space?.railway_project_id);
  const readiness = diag.configured && hasService ? 'configured' : 'manual_required';
  return {
    provider: 'railway',
    readiness,
    manual_required: !diag.configured || !hasService,
    env_required: diag.missing,
    project_linkage: space?.railway_project_id || null,
    service_linkage: space?.railway_service_id || null,
    exact_next_step: readiness === 'configured'
      ? 'git push 후 자동 배포 또는 Railway dashboard에서 수동 트리거'
      : !diag.configured
        ? `RAILWAY_TOKEN 환경변수 설정 후 프로젝트 연결`
        : 'Railway 프로젝트/서비스 생성 후 railway_project_id를 project space에 등록',
    result_update_path: `project space ${space?.project_id} 또는 data/deploy-results/${run?.run_id || 'unknown'}.json`,
    live_create_supported: false,
  };
}
