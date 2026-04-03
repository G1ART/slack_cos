/**
 * vNext.13 — 창업자 자연어 → 제안 패킷(실행 분기 라벨이 아님).
 * 휴리스틱은 "이해·제안" 본문 생성용이며 intent/keyword 라우팅 표면으로 노출하지 않는다.
 */

import { emptyProposalPacket, formatProposalPacketForSlack } from './founderProposalPacket.js';
import { buildFounderApprovalPacket } from './founderApprovalPacket.js';

/** 실제 코드/DB/배포 mutation 의도 — 단어 언급만으로는 외부 실행 금지 (보조 신호) */
const RE_GENUINE_MUTATION =
  /(?:실제로|지금\s*바로)\s*(?:실행|배포|적용)|마이그레이션\s*적용|프로덕션\s*(?:배포|반영)|\bPR\b\s*(?:열|생성|올려|올리)|브랜치\s*(?:푸시|만들|생성)|supabase\s*(?:에\s*)?(?:직접|라이브)\s*적용|코드\s*반영|DB\s*스키마\s*바꿔|깃허브\s*이슈\s*(?:열|만들)|커서\s*라이브/i;
const RE_INTERNAL =
  /벤치마크|경쟁사|시장\s*조사|리서치|표로\s*정리|시나리오\s*\d|투자자\s*풀|유형별|초안\s*메모|내부\s*메모|teardown|티어\s*나눠|차별화\s*전략|competitor|benchmark|differentiation|memo\s*only|internal\s*memo/i;
const RE_IR = /IR|원페이저|펀딩|피치|덱|deck|narrative|내러티브|투자자|LP|VC/i;
const RE_BUDGET = /예산|runway|런웨이|비용|배분|allocation|시나리오|budget|scenario|scenarios/i;
const RE_PLATFORM = /플랫폼|빌드|MVP|구현|앱|개발|GitHub|github|Cursor|Supabase/i;
const RE_STRATEGY = /전략|벤치마킹|로드맵|북극성|메모/i;
/** genuine mutation 없을 때 business·문서 업무는 COS_ONLY 기본 (C3) */
const RE_BUSINESS_OPS_COS_DEFAULT =
  /IR\s*덱|덱\s*(?:narrative|내러티브|서사)|투자자별|톤(?:을)?\s*나눠|메시지\s*맞춰|원페이저|one-?pager|예산(?:안)?\s*구조|시나리오\s*\d|전략\s*메모|크리틱|비평|리프레이밍|리라이트/i;

/**
 * @param {{ rawText: string, contextFrame: Record<string, unknown> }} args
 * @returns {object}
 */
export function buildProposalFromFounderInput({ rawText, contextFrame }) {
  const t = String(rawText || '').trim();
  const p = emptyProposalPacket();

  // C1 — primary: 맥락·목표·제약·의도; 정규식은 아래 보조 신호로만 사용
  p.context_assumptions = [];
  const goalHint = contextFrame?.goal_line_hint ? String(contextFrame.goal_line_hint).trim() : '';
  const northStar = contextFrame?.north_star_hint ? String(contextFrame.north_star_hint).trim() : '';
  const successHint = contextFrame?.success_condition_hint
    ? String(contextFrame.success_condition_hint).trim()
    : '';
  if (goalHint) {
    p.context_assumptions.push(`기존 프로젝트·인테이크 목표(우선): ${goalHint}`);
  }
  if (northStar && northStar !== goalHint) {
    p.context_assumptions.push(`북극성·우선순위 힌트: ${northStar}`);
  }
  if (successHint) {
    p.context_assumptions.push(`직전에 잡힌 성공 조건·지표 힌트: ${successHint}`);
  }
  const tx = contextFrame?.transcript_excerpt ? String(contextFrame.transcript_excerpt).trim() : '';
  if (tx) {
    const tail = tx.length > 220 ? `…${tx.slice(-220)}` : tx;
    p.context_assumptions.push(`최근 스레드 맥락(우선): ${tail}`);
  }
  if (contextFrame?.constraints?.length) {
    p.context_assumptions.push(`직전 합의·제약: ${contextFrame.constraints.join(' · ')}`);
  }
  if (contextFrame?.has_run) {
    p.context_assumptions.push('이 스레드에 활성 실행 런이 있습니다. 제안은 런 상태 변경 전 승인을 전제로 합니다.');
  } else {
    p.context_assumptions.push('아직 실행 스파인이 없을 수 있습니다. 외부 실행이 필요하면 별도 승인 패킷을 먼저 드립니다.');
  }

  const goalForVoice = goalHint || northStar;
  p.understood_request = t
    ? `지금 말씀을 함께 읽었습니다: 「${t.slice(0, 500)}${t.length > 500 ? '…' : ''}」${
        goalForVoice
          ? ` 목표·북극성 맥락으로는 「${goalForVoice.slice(0, 140)}${goalForVoice.length > 140 ? '…' : ''}」을 기준에 둡니다.`
          : ''
      }${successHint ? ` 성공 조건 힌트: 「${successHint.slice(0, 120)}${successHint.length > 120 ? '…' : ''}」` : ''}`
    : '빈 입력입니다. 한 문장만 더 구체화해 주시면 제안을 좁히겠습니다.';

  if (!t) {
    p.open_questions.push('어떤 결과물(문서/실행/검토)까지가 이번 턴의 목표인가요?');
    p.cos_only_tasks.push('목표가 정해지면 COS_ONLY로 먼저 응답·초안을 드립니다.');
    return finalizeProposal(p, t);
  }

  const sig = {
    genuineMutation: RE_GENUINE_MUTATION.test(t),
    internal: RE_INTERNAL.test(t),
    ir: RE_IR.test(t),
    budget: RE_BUDGET.test(t),
    platform: RE_PLATFORM.test(t),
    strategy: RE_STRATEGY.test(t),
  };

  const docCosOnlyFirst =
    RE_BUSINESS_OPS_COS_DEFAULT.test(t) ||
    ((sig.ir || sig.budget) && !sig.platform && !sig.genuineMutation);

  const domainCount = [sig.ir, sig.budget, sig.platform, sig.strategy, sig.internal].filter(Boolean).length;
  if (domainCount >= 2 && !sig.genuineMutation && t.length < 90) {
    p.open_questions.push(
      '제가 이해한 바가 맞다면… 이번 턴은 (A) 문서·서사·시나리오 초안만 인가요, (B) 툴 실행 승인까지 포함인가요? 한 글자만 A/B로 답해 주셔도 됩니다.',
    );
  }

  if (sig.genuineMutation && !docCosOnlyFirst) {
    p.external_execution_tasks.push(
      '연결된 툴체인으로 GitHub/Cursor/Supabase/배포 계열 액션 실행 — 대표 승인 패킷 확정 후에만',
    );
    p.approval_required = true;
    p.approval_reason = 'COS가 외부 시스템 상태 변경이 필요하다고 판단했습니다. 승인 후에만 디스패치합니다.';
    p.cos_only_tasks.push('승인 전: 범위·리스크·롤백 포인트를 Slack에서 먼저 합의');
    p.internal_support_tasks.push('승인 전: 내부 초안·체크리스트로 실행 계획을 고정');
  }

  if (sig.ir) {
    p.cos_only_tasks.push('서사·메시지·슬라이드 구조 리라이트 및 투자자 톤 맞춤(COS_ONLY 우선)');
    if (sig.internal) {
      p.internal_support_tasks.push('투자자 세그먼트별 비교표·초안 메모(내부 아티팩트)');
    }
  } else if (sig.budget) {
    p.cos_only_tasks.push('예산 구조·가정·트레이드오프를 대화로 정렬(COS_ONLY)');
    if (/시나리오|3\s*개|세\s*가지|공격|중립|보수|scenario|scenarios|three|aggressive|neutral|conservative/i.test(t)) {
      p.internal_support_tasks.push('시나리오별 숫자·가정 표 초안(내부 아티팩트, 외부 시스템 없음)');
    }
  } else if (sig.platform || sig.strategy) {
    p.cos_only_tasks.push('목표·범위·리스크를 COS에서 먼저 문장으로 고정');
    p.internal_support_tasks.push('벤치마크·리서치 메모·스펙 아웃라인 등 내부 산출물(필요 시)');
  } else {
    p.cos_only_tasks.push('요청을 Slack 대화 안에서 해석·정리·초안 제시');
  }

  if (sig.internal && !p.internal_support_tasks.length) {
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

  if (!sig.genuineMutation && !p.open_questions.length && (sig.ir || sig.budget) && sig.platform) {
    p.open_questions.push(
      '이 두 갈래 중 어디가 맞는지요: 문서·톤만 다듬기 vs GitHub/Cursor/Supabase까지 실제 반영? 후자면 mutation 의도를 한 문장으로 명시해 주세요.',
    );
  }

  return finalizeProposal(p, t);
}

function finalizeProposal(p, raw) {
  if (!p.open_questions.length && raw.length < 8) {
    p.open_questions.push('이번 턴에서 “끝”의 정의(예: 초안만 vs 실행까지)를 한 줄로 알려주실 수 있을까요?');
  }
  if (!p.open_questions.length && raw.length > 8 && raw.length < 40 && !p.external_execution_tasks.length) {
    p.open_questions.push('불명확할 때는 external task를 바로 만들지 않고 여기서 질문으로 좁힙니다. 구체적으로 어떤 산출물이 필요하신가요?');
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
