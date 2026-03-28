/**
 * 빌드 스레드 정본 객체 — memo/work candidate 가 아닌 **ProjectSpecSession** (v0 필드).
 * @see projectSpecSession.js — mutation·라우터 소유권
 */

/** 대표 표면에 노출 금지 — Council / operator 유도 시그니처 (회귀·가드) */
export const PROJECT_SPEC_BUILD_ZONE_BANNED_SUBSTRINGS = [
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장',
  '핵심 리스크',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '실행 작업 후보',
  '업무등록:',
  '종합 추천안',
  '협의 모드: council',
];

/**
 * @param {string} goalLine
 * @param {string} threadKey
 * @param {string} ownerUserId
 */
export function createProjectSpecSession(goalLine, threadKey, ownerUserId) {
  const now = new Date().toISOString();
  const g = String(goalLine || '').trim();
  return {
    session_id: `PSS-${String(threadKey).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(-48)}-${Date.now().toString(36)}`,
    thread_key: threadKey,
    owner_user_id: String(ownerUserId || ''),

    stage: 'explore',

    problem_statement: g || null,
    primary_user_context: null,
    mvp_summary: null,

    includes: [],
    excludes: [],
    answers: {},
    approval_rules: [],

    open_items: [],
    safe_defaults_applied: [],
    current_mvp_risks: [],

    future_phase_backlog: [],
    proceed_requested: false,

    last_owner_facing_packet: 'kickoff',

    created_at: now,
    updated_at: now,
  };
}

/** 목표 문장으로 MVP 포함/제외 기본 시드 — 충분성 게이트가 transcript가 아닌 spec을 보도록 함 */
export function seedSpecMvpDefaultsFromProblem(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const p = String(s.problem_statement || '');
  if (!p.trim()) return s;
  const inc = Array.isArray(s.includes) ? s.includes : [];
  const exc = Array.isArray(s.excludes) ? s.excludes : [];
  if (inc.length && exc.length) return s;

  if (/캘린더|일정|스케줄|예약|갤러리|멤버/i.test(p)) {
    if (!inc.length) {
      s.includes = ['멤버·팀 일정 보기/등록(v1)', '승인 규칙 반영(v1)'];
    }
    if (!exc.length) {
      s.excludes = ['외부 공개 블랙아웃 링크(v2+)', '가격/결제 안내 트리거(v2+)'];
    }
  } else {
    if (!inc.length) s.includes = ['MVP 핵심 기능(v1)'];
    if (!exc.length) s.excludes = ['명시적 후순위 항목(v2+)'];
  }
  return s;
}
