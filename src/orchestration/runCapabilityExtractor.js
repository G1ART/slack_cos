/**
 * vNext.13-CORRECTIVE — Capability 정본: 승인된 제안 패킷(또는 명시 플래그) 우선.
 * 잠긴 런 텍스트 키워드 매핑은 `internal_planner_capability_source === 'locked_run_text'` 또는
 * (비-foundr-origin & authorized) 호환 폴백에서만.
 */

const DB_PATTERNS = [
  /supabase/i, /database/i, /schema/i, /migration/i, /table/i, /column/i,
  /RLS/i, /policy/i, /스키마/i, /테이블/i, /데이터/i, /DB/i, /저장/i,
  /backend.*persist/i, /auth.*store/i, /user.*model/i,
];

/** @returns {ReturnType<typeof extractRunCapabilities>} */
export function defaultEmptyCapabilities() {
  return {
    research: false,
    spec_refine: false,
    fullstack_code: false,
    uiux_design: false,
    db_schema: false,
    deploy_preview: false,
    qa_validation: false,
    research_only: false,
    market_research: false,
    strategy_memo: false,
    document_write: false,
    document_review: false,
    budget_planning: false,
    financial_scenario: false,
    ir_deck: false,
    investor_research: false,
    outreach_copy: false,
  };
}

/**
 * @param {object} run
 */
function extractRunCapabilitiesFromLockedRunText(run) {
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

  const fullstack_code =
    !research_only && (codeSignals || deploy_preview || db_schema);

  const spec_refine = has(/스펙|요구사항|정의|범위\s*잠금|scope|IA|정보\s*구조|북극성|로드맵/i);

  const qa_validation = !research_only && (codeSignals || db_schema || uiux || deploy_preview);

  const base = defaultEmptyCapabilities();
  return {
    ...base,
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

function mergeBusinessOntoPlanner(base, biz) {
  const o = { ...base };
  o.market_research = !!biz.market_research;
  o.strategy_memo = !!biz.strategy_memo;
  o.document_write = !!biz.document_write;
  o.document_review = !!biz.document_review;
  o.budget_planning = !!biz.budget_planning;
  o.financial_scenario = !!biz.financial_scenario;
  o.ir_deck = !!biz.ir_deck;
  o.investor_research = !!biz.investor_research;
  o.outreach_copy = !!biz.outreach_copy;

  if (biz.market_research || biz.investor_research) o.research = true;
  if (
    biz.strategy_memo ||
    biz.document_write ||
    biz.document_review ||
    biz.budget_planning ||
    biz.financial_scenario ||
    biz.ir_deck ||
    biz.outreach_copy
  ) {
    o.spec_refine = true;
  }
  return o;
}

/**
 * 승인된 제안 스냅샷 → 플래너 레인 플래그(외부 작업은 authorized 일 때만 fullstack/db/deploy).
 * @param {object} run
 */
export function plannerCapabilitiesFromApprovedProposal(run) {
  const snap = run?.approved_proposal_snapshot;
  if (!snap || typeof snap !== 'object') return null;
  const biz = extractCapabilitiesFromProposalPacket(snap);
  let o = mergeBusinessOntoPlanner(defaultEmptyCapabilities(), biz);

  const ext = snap.external_execution_tasks || [];
  const extHay = ext.map((x) => String(x)).join('\n');
  const authOk = run?.external_execution_authorization?.state === 'authorized';
  if (ext.length && authOk) {
    if (/github|cursor|supabase|배포|vercel|railway|PR|브랜치|마이그레이션/i.test(extHay)) {
      o.fullstack_code = true;
      o.qa_validation = true;
    }
    if (/supabase|스키마|DB|마이그레이션/i.test(extHay)) o.db_schema = true;
    if (/배포|vercel|railway|프리뷰|프로덕션/i.test(extHay)) o.deploy_preview = true;
    if (/UI|UX|화면|와이어/i.test(extHay)) o.uiux_design = true;
  }

  const hasExecSurface =
    o.fullstack_code || o.db_schema || o.deploy_preview || o.uiux_design || o.qa_validation;
  o.research_only = o.research && !hasExecSurface && !o.spec_refine;
  return o;
}

function hasAnyPlannerTrue(c) {
  return (
    c.research ||
    c.spec_refine ||
    c.fullstack_code ||
    c.uiux_design ||
    c.db_schema ||
    c.deploy_preview ||
    c.qa_validation
  );
}

/**
 * @param {object} run
 * @returns {ReturnType<typeof defaultEmptyCapabilities>}
 */
export function extractRunCapabilities(run) {
  const flags = run?.approved_proposal_capability_flags;
  if (flags && typeof flags === 'object' && Object.keys(flags).length > 0) {
    return { ...defaultEmptyCapabilities(), ...flags };
  }

  const fromProposal = plannerCapabilitiesFromApprovedProposal(run);
  if (fromProposal && hasAnyPlannerTrue(fromProposal)) {
    return fromProposal;
  }

  if (run?.internal_planner_capability_source === 'locked_run_text') {
    return extractRunCapabilitiesFromLockedRunText(run);
  }

  const auth = run?.external_execution_authorization?.state;
  const founderOrigin = run?.founder_origin_run === true;
  if (auth === 'authorized' && !founderOrigin) {
    return extractRunCapabilitiesFromLockedRunText(run);
  }

  return defaultEmptyCapabilities();
}

export { DB_PATTERNS };
