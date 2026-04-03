/**
 * vNext.13 — 창업자 자연어 → 제안 패킷(실행 분기 라벨이 아님).
 * 휴리스틱은 "이해·제안" 본문 생성용이며 intent/keyword 라우팅 표면으로 노출하지 않는다.
 */

import { emptyProposalPacket, formatProposalPacketForSlack } from './founderProposalPacket.js';
import { buildFounderApprovalPacket } from './founderApprovalPacket.js';

const RE_EXTERNAL = /github|cursor|supabase|vercel|railway|실제로\s*실행|배포\s*파이프|프로덕션|PR|브랜치|마이그레이션\s*적용/i;
const RE_INTERNAL = /벤치마크|경쟁사|시장\s*조사|리서치|표로\s*정리|시나리오\s*\d|투자자\s*풀|유형별|초안\s*메모|내부\s*메모/i;
const RE_IR = /IR|원페이저|펀딩|피치|덱|deck|투자자|LP|VC/i;
const RE_BUDGET = /예산|runway|런웨이|비용|배분|allocation|시나리오/i;
const RE_PLATFORM = /플랫폼|빌드|MVP|구현|앱|개발/i;
const RE_STRATEGY = /전략|벤치마킹|로드맵|북극성/i;

/**
 * @param {{ rawText: string, contextFrame: Record<string, unknown> }} args
 * @returns {object}
 */
export function buildProposalFromFounderInput({ rawText, contextFrame }) {
  const t = String(rawText || '').trim();
  const p = emptyProposalPacket();

  p.context_assumptions = [];
  if (contextFrame?.goal_line_hint) {
    p.context_assumptions.push(`대화·인테이크에서 본 목표 한 줄: ${contextFrame.goal_line_hint}`);
  }
  if (contextFrame?.has_run) {
    p.context_assumptions.push('이 스레드에 활성 실행 런이 있습니다. 제안은 런 상태 변경 전 승인을 전제로 합니다.');
  } else {
    p.context_assumptions.push('아직 실행 스파인이 없을 수 있습니다. 외부 실행이 필요하면 별도 승인 패킷을 먼저 드립니다.');
  }
  if (contextFrame?.transcript_excerpt) {
    p.context_assumptions.push('최근 스레드 맥락을 반영해 요약했습니다.');
  }

  p.understood_request = t
    ? `요청 본문을 다음으로 정리했습니다: 「${t.slice(0, 500)}${t.length > 500 ? '…' : ''}」`
    : '빈 입력입니다. 한 문장만 더 구체화해 주시면 제안을 좁히겠습니다.';

  if (!t) {
    p.open_questions.push('어떤 결과물(문서/실행/검토)까지가 이번 턴의 목표인가요?');
    p.cos_only_tasks.push('목표가 정해지면 COS_ONLY로 먼저 응답·초안을 드립니다.');
    return finalizeProposal(p, t);
  }

  if (RE_EXTERNAL.test(t)) {
    p.external_execution_tasks.push('연결된 툴체인으로 GitHub/Cursor/Supabase/배포 계열 액션 실행(승인 후)');
    p.approval_required = true;
    p.approval_reason = '외부 시스템 상태를 바꿀 수 있는 실행이 포함됩니다.';
    p.cos_only_tasks.push('승인 전: 범위·리스크·롤백 포인트를 Slack에서 먼저 합의');
    p.internal_support_tasks.push('승인 전: 내부 초안·체크리스트로 실행 계획을 고정');
  }

  if (RE_IR.test(t)) {
    p.cos_only_tasks.push('서사·메시지·슬라이드 구조 리라이트 및 투자자 톤 맞춤(COS_ONLY 우선)');
    if (RE_INTERNAL.test(t)) {
      p.internal_support_tasks.push('투자자 세그먼트별 비교표·초안 메모(내부 아티팩트)');
    }
  } else if (RE_BUDGET.test(t)) {
    p.cos_only_tasks.push('예산 구조·가정·트레이드오프를 대화로 정렬(COS_ONLY)');
    if (/시나리오|3\s*개|세\s*가지/.test(t)) {
      p.internal_support_tasks.push('시나리오별 숫자·가정 표 초안(내부 아티팩트, 외부 시스템 없음)');
    }
  } else if (RE_PLATFORM.test(t) || RE_STRATEGY.test(t)) {
    p.cos_only_tasks.push('목표·범위·리스크를 COS에서 먼저 문장으로 고정');
    p.internal_support_tasks.push('벤치마크·리서치 메모·스펙 아웃라인 등 내부 산출물(필요 시)');
  } else {
    p.cos_only_tasks.push('요청을 Slack 대화 안에서 해석·정리·초안 제시');
  }

  if (RE_INTERNAL.test(t) && !p.internal_support_tasks.length) {
    p.internal_support_tasks.push('조사·정리·표 형태 산출물을 내부 하네스 경로로 생성(외부 mutation 없음)');
  }

  p.proposed_roadmap = [
    '① 제안 패킷 확인 → ② 승인 범위 선택 → ③ (승인 시) 실행 플랜 반영 → ④ truth_reconciliation로 완료 판정',
  ];
  p.proposed_deliverables = [
    '이 스레드에 남는 제안 본문',
    '외부 실행 시: 경로·ref가 기록된 아티팩트와 reconciliation 요약',
  ];
  p.expected_impact.push('결정 전에는 외부 상태를 바꾸지 않고, 합의된 범위만 실행합니다.');
  p.risks.push('요청이 모호하면 먼저 질문으로 좁힙니다.');
  if (p.external_execution_tasks.length) {
    p.risks.push('외부 실행은 대표 승인 없이 진행하지 않습니다. 배포는 최종 kill point입니다.');
  }

  return finalizeProposal(p, t);
}

function finalizeProposal(p, raw) {
  if (!p.open_questions.length && raw.length < 8) {
    p.open_questions.push('이번 턴에서 “끝”의 정의(예: 초안만 vs 실행까지)를 한 줄로 알려주실 수 있을까요?');
  }
  return p;
}

/**
 * @param {object} proposal
 * @returns {string}
 */
export function formatFullFounderProposalSurface(proposal) {
  const body = formatProposalPacketForSlack(proposal);
  const { visible_section } = buildFounderApprovalPacket(proposal);
  return visible_section ? `${body}\n${visible_section}` : body;
}
