/**
 * COS 작업 흐름 — 사용자·비서실장(COS)·에이전트 역할을 한 축으로 묶는다.
 * @see docs/cursor-handoffs/COS_NorthStar_Workflow_2026-03.md
 * @see docs/cursor-handoffs/COS_Project_Directive_NorthStar_FastTrack_v1.md — GOAL-IN/DECISION-OUT 제품 정본
 * @see docs/cursor-handoffs/COS_NorthStar_Alignment_Memo_2026-03-24.md — M2a/M2b·no-go·구현 순서
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md — M2 필드·하네스 번역·M5a/b
 * @see docs/cursor-handoffs/COS_Workspace_Vision_CompanyScale_2026-03.md — harness-class → 슬랙 COS 워크스페이스·회사 규모 투자 논리
 */

/** @type {{ id: string, title: string, user_role: string, cos_role: string }[]} */
export const WORKFLOW_PHASES = [
  {
    id: 'align',
    title: '정렬 (Align)',
    user_role: '목표·과제를 자연어로 말하고, 모호하면 답한다.',
    cos_role:
      '평소 **자연어 대화**로 답하고, `COS`/`비서` 내비로 이해·질문·다음 단계 제안. 필요 시 `협의모드:`로 다각 논의.',
  },
  {
    id: 'agree',
    title: '합의 (Agree)',
    user_role: '범위·우선순위·리스크 수용 여부를 말로 확정한다.',
    cos_role: '합의 여지·막힌 결정을 드러내고, `결정기록:` 등으로 남길 수 있게 안내.',
  },
  {
    id: 'plan',
    title: '계획 박기 (Plan)',
    user_role: '실행 단위가 보이면 승인.',
    cos_role: '`계획등록:`로 PLN/WRK 구조화. 조회 명령으로 QC.',
  },
  {
    id: 'execute',
    title: '이행 (Execute)',
    user_role: '게이트(승인·배포)에서만 개입.',
    cos_role: '업무/run·GitHub·Cursor 등 어댑터로 작업 이어감. (향후 에이전트 툴 호출로 자동화 확장)',
  },
];

export const WORKFLOW_PHASE_IDS = WORKFLOW_PHASES.map((p) => p.id);

/**
 * `도움말` 상단에 붙는 North Star 블록 (문자열)
 */
export function formatCosNorthStarHelpPreamble() {
  const lines = [
    '━━ COS North Star · Fast-Track v1 ━━',
    '**GOAL-IN / DECISION-OUT** — 대표 표면은 `도움말`(5류), 엔진 어휘는 `운영도움말`.',
    '당신은 **고지능·고감성·균형 잡힌 AI 비서실장(COS)** 과 일합니다. (고감성 = 이용자 스펙트럼 이해 + 직설·충성, 감정용 돌려말하기 아님)',
    '**과제/툴 정의가 서로 합의될 때까지**는 자연어 대화·내비·협의로 다듬고, **합의 후** 실행·에이전트 작업은 COS가 이어 갑니다.',
    '명령어 전체를 외울 필요 없습니다. 보통은 `COS …` / `비서 …` 로 시작하거나, 그냥 **평문으로** 말해도 COS가 대화합니다.',
    '구현·피드백을 **바로 큐에 남기려면** 첫 줄에 `실행큐에 올려줘` 또는 `고객피드백으로 저장` 만 쓰고 **다음 줄에 본문**을 적어도 됩니다 (`실행큐:` 접두 없이).',
    '긴 대화 턴 끝에는 **실행 큐 / 고객 피드백 / 안 올림** 버튼이 붙을 수 있습니다. 해당 없으면 *안 올림*만 누르면 됩니다.',
    '',
    '**4단계 흐름**',
    ...WORKFLOW_PHASES.map(
      (p, i) =>
        `${i + 1}. *${p.title}* — 당신: ${p.user_role} / COS: ${p.cos_role}`
    ),
    '',
  ];
  return lines.join('\n');
}
