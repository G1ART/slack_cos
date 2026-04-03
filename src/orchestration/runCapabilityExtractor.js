/**
 * vNext.12 — Derive execution capabilities from locked run text (planner input).
 */

const DB_PATTERNS = [
  /supabase/i, /database/i, /schema/i, /migration/i, /table/i, /column/i,
  /RLS/i, /policy/i, /스키마/i, /테이블/i, /데이터/i, /DB/i, /저장/i,
  /backend.*persist/i, /auth.*store/i, /user.*model/i,
];

/**
 * @param {object} run
 * @returns {{
 *   research: boolean,
 *   spec_refine: boolean,
 *   fullstack_code: boolean,
 *   uiux_design: boolean,
 *   db_schema: boolean,
 *   deploy_preview: boolean,
 *   qa_validation: boolean,
 *   research_only: boolean,
 * }}
 */
export function extractRunCapabilities(run) {
  const hay = [
    run?.project_goal,
    run?.locked_mvp_summary,
    ...(run?.includes || []),
    ...(run?.excludes || []),
  ].join('\n');

  const has = (re) => re.test(hay);

  const research_signals = has(
    /벤치마크|benchmark|리서치|시장\s*조사|경쟁사|타사|레퍼런스|모방|조사\s*먼저|먼저\s*알/i,
  );
  const uiux = has(/UI|UX|uiux|화면|와이어|디자인|인터랙션|사용자\s*경험|피그마|목업|UX\s*writing/i);
  const db_schema = DB_PATTERNS.some((re) => re.test(hay));
  const deploy_preview = has(/배포|프리뷰|프로덕션|railway|vercel|스테이징|staging|preview\s*url/i);
  const codeSignals = has(
    /구현|개발|코드|API|MVP|앱|빌드|프론트|백엔드|기능|feature|캘린더|CRUD|slack\s*봇|socket|통합/i,
  );
  const hasIncludes = Array.isArray(run?.includes) && run.includes.length > 0;

  const research_only =
    research_signals && !codeSignals && !hasIncludes && !db_schema && !uiux && !deploy_preview;

  /** GitHub/Cursor 경로: 코드·앱·배포 실행 표면이 있을 때만 (연구-only·문서-only 제외) */
  const fullstack_code =
    !research_only && (codeSignals || deploy_preview || db_schema);

  const spec_refine = has(/스펙|요구사항|정의|범위\s*잠금|scope|IA|정보\s*구조|북극성|로드맵/i);

  /** QA: 코드/DB/UI/배포 표면이 하나라도 있을 때만 (순수 리서치-only 제외) */
  const qa_validation = !research_only && (codeSignals || db_schema || uiux || deploy_preview);

  return {
    research: research_signals,
    spec_refine,
    fullstack_code,
    uiux_design: uiux && !research_only,
    db_schema: db_schema && !research_only,
    deploy_preview: deploy_preview && !research_only,
    qa_validation,
    research_only,
  };
}

/**
 * vNext.13 — 플래너 입력은 제안 패킷의 작업 문장(창업자 원문 직접 키워드 매핑 아님).
 * @param {{ cos_only_tasks?: string[], internal_support_tasks?: string[], external_execution_tasks?: string[] }} proposal
 * @returns {Record<string, boolean>}
 */
export function extractCapabilitiesFromProposalPacket(proposal) {
  const hay = [
    ...(proposal?.cos_only_tasks || []),
    ...(proposal?.internal_support_tasks || []),
    ...(proposal?.external_execution_tasks || []),
  ].join('\n');
  const has = (re) => re.test(hay);

  return {
    market_research: has(/시장|리서치|벤치마크|경쟁사|조사/i),
    strategy_memo: has(/전략\s*메모|북극성|로드맵|포지셔닝/i),
    document_write: has(/문서|초안|작성|원페이저|메모/i),
    document_review: has(/리뷰|비평|red\s*team|크리틱/i),
    budget_planning: has(/예산|배분|allocation|runway|런웨이/i),
    financial_scenario: has(/시나리오|재무|숫자\s*가정/i),
    ir_deck: has(/IR|덱|deck|피치|펀딩/i),
    investor_research: has(/투자자|VC|LP|세그먼트/i),
    outreach_copy: has(/아웃리치|메시지|이메일\s*카피|캠페인/i),
  };
}

export { DB_PATTERNS };
