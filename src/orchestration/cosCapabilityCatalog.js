/**
 * vNext.11 — 실행용 capability ↔ agent ↔ provider 매핑 (설명용 레지스트리 승격 1단계).
 * 라우트 판정의 정본은 `planExecutionRoutes.js` + `runCapabilityExtractor.js`.
 */

/** @typedef {'github'|'cursor_cloud'|'supabase_dispatch'|'railway'|'vercel'|'internal_artifact'} ProviderKey */

/** @type {Record<string, { agent: string, providers: ProviderKey[], notes: string }>} */
export const CAPABILITY_AGENT_MAP = {
  research: { agent: 'research_agent', providers: ['internal_artifact'], notes: '벤치/시장 신호 시 연구 노트' },
  spec_refine: { agent: 'cos_planner', providers: ['internal_artifact'], notes: '스펙 정리·IA (내부 산출)' },
  fullstack_code: { agent: 'fullstack_swe', providers: ['github', 'cursor_cloud'], notes: '이슈/브랜치·코드 실행 경로' },
  uiux_design: { agent: 'uiux_designer', providers: ['internal_artifact'], notes: 'UI/인터랙션 범위' },
  db_schema: { agent: 'db_ops', providers: ['supabase_dispatch'], notes: '스키마·마이그레이션·스테이징 전달' },
  db_data: { agent: 'db_ops', providers: ['supabase_dispatch'], notes: '데이터층 (스키마와 동일 브리지)' },
  deploy_preview: { agent: 'deploy_ops', providers: ['vercel', 'railway'], notes: '프리뷰·배포 상태' },
  qa_validation: { agent: 'qa_agent', providers: ['internal_artifact'], notes: '코드/DB/UI 변경 시 체크리스트' },
  docs_handoff: { agent: 'cos_planner', providers: ['internal_artifact'], notes: '문서·핸드오프' },
  external_reporting: { agent: 'cos_planner', providers: ['internal_artifact'], notes: '외부 보고 산출' },
};
