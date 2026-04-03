import { FounderIntent } from './founderContracts.js';
import { writeFounderDialogueContract } from './cosDialogueWriter.js';

const GENERIC_CLARIFICATION_PATTERNS = [
  /조금\s*더\s*구체적으로/u,
  /최적의\s*경로로\s*안내/u,
  /원하시면\s*도와/u,
];

const META_DEBUG_RE =
  /(responder|surface|sanitize|router|라우터|라우팅|pipeline|파이프라인)/i;
const STATUS_RE = /(지금\s*어디까지|상태|진행\s*상황|status)/i;
const APPROVAL_RE = /(실행\s*넘겨|실행해|승인|approve)/i;
const DEPLOY_RE = /(배포|deploy)/i;
const SCOPE_LOCK_RE = /(범위.*잠그|scope\s*lock|mvp\s*범위.*잠그)/i;
const PUSHBACK_RE = /(동시에|둘\s*다|리스크\s*거의\s*없|완벽|무조건)/i;

const KICKOFF_HINT_RE =
  /(만들자|시작하자|구축|신규|프로젝트|앱|툴|도입|개발)/i;

export function classifyGoldContract(text, metadata = {}) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'followup', intent: FounderIntent.UNKNOWN_EXPLORATORY, confidence: 0.4 };
  if (META_DEBUG_RE.test(t)) return { kind: 'meta_debug', intent: FounderIntent.META_DEBUG, confidence: 0.95 };
  if (STATUS_RE.test(t)) return { kind: 'status', intent: FounderIntent.PROJECT_STATUS, confidence: 0.9 };
  if (APPROVAL_RE.test(t)) return { kind: 'approval', intent: FounderIntent.APPROVAL_ACTION, confidence: 0.85 };
  if (DEPLOY_RE.test(t)) return { kind: 'deploy', intent: FounderIntent.DEPLOY_LINKAGE, confidence: 0.8 };
  if (SCOPE_LOCK_RE.test(t)) return { kind: 'scope_lock_request', intent: FounderIntent.SCOPE_LOCK_REQUEST, confidence: 0.95 };
  if (PUSHBACK_RE.test(t)) return { kind: 'pushback', intent: FounderIntent.PROJECT_CLARIFICATION, confidence: 0.75 };
  if (!metadata.has_active_intake && KICKOFF_HINT_RE.test(t)) {
    return { kind: 'kickoff', intent: FounderIntent.PROJECT_KICKOFF, confidence: 0.85 };
  }
  return { kind: 'followup', intent: FounderIntent.PROJECT_CLARIFICATION, confidence: 0.7 };
}

export function buildDialoguePacket(text, mode = 'kickoff') {
  return writeFounderDialogueContract(text, mode);
}

export function isGenericClarification(text) {
  const t = String(text || '');
  return GENERIC_CLARIFICATION_PATTERNS.some((re) => re.test(t));
}

export function buildScopeLockPacket(text, metadata = {}) {
  const t = String(text || '').trim();
  const projectName = metadata.project_label || (t.includes('캘린더') ? '더그린 운영 캘린더 MVP' : 'Founder Project MVP');
  return {
    packet_type: 'scope_lock_packet',
    project_name: projectName,
    problem_definition: '운영 혼선을 줄이기 위해 일정/권한/승인 흐름을 일관되게 통합 관리한다.',
    target_users: ['내부 운영 멤버', '관리자(승인권자)', '외부 링크 수신자(제한 접근)'],
    mvp_scope: ['핵심 일정 등록/수정', '권한 기반 접근제어', '충돌 방지 룰', '알림/승인 로그'],
    excluded_scope: ['결제/정산', '고급 BI 분석', '복수 외부 플랫폼 동시 연동'],
    core_hypothesis: '권한+룰 기반 운영 캘린더로 2주 내 일정 충돌과 누락을 유의미하게 줄일 수 있다.',
    success_metrics: ['일정 충돌 30% 감소', '누락 50% 감소', '운영자 관리시간 20% 절감'],
    key_risks: ['입력 규칙 미준수', '권한 과다 부여', '운영 책임 공백'],
    initial_architecture: 'Slack COS -> execution spine -> provider adapters(GitHub/Cursor/Supabase optional)',
    recommended_sequence: ['데이터 모델 잠금', '권한/룰 구현', 'UI/입력 흐름', '파일럿 검증', '확장 여부 결정'],
    founder_approval_required: true,
  };
}

export function buildStatusPacket(ctx = {}) {
  return {
    packet_type: 'status_report_packet',
    current_stage: ctx.current_stage || 'align',
    completed: ctx.completed || ['문제 재정의', '벤치마크 축 정의'],
    in_progress: ctx.in_progress || ['MVP 범위 잠금'],
    blocker: ctx.blocker || '없음',
    provider_truth: ctx.provider_truth || ['live: 없음', 'manual_bridge: 없음'],
    provider_truth_friendly: ctx.provider_truth_friendly || [],
    next_actions: ctx.next_actions || ['scope lock 확정', 'run 생성', 'workstream 분배'],
    founder_action_required: ctx.founder_action_required || '핵심 결정 3개 확정',
  };
}

export function buildHandoffPacket(ctx = {}) {
  return {
    packet_type: 'handoff_packet',
    project_ref: ctx.project_ref || 'project_space_pending',
    run_ref: ctx.run_ref || 'run_pending',
    dispatched_workstreams: ctx.dispatched_workstreams || ['research_benchmark', 'fullstack_swe', 'uiux_design', 'qa_qc'],
    provider_truth: ctx.provider_truth || ['github: manual_bridge', 'cursor: manual_bridge', 'supabase: optional'],
    provider_truth_friendly: ctx.provider_truth_friendly || [],
    founder_next_action: ctx.founder_next_action || '첫 실행 패킷 승인',
  };
}
