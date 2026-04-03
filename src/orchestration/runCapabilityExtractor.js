/**
 * vNext.11 — Derive execution capabilities from locked run text (not static lanes).
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
    research_signals && !codeSignals && !hasIncludes && !db_schema && !uiux;

  const fullstack_code = !research_only;
  const spec_refine = has(/스펙|요구사항|정의|범위\s*잠금|scope|IA|정보\s*구조/i);

  const qa_validation =
    !research_only && (fullstack_code || db_schema || uiux || deploy_preview);

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

export { DB_PATTERNS };
