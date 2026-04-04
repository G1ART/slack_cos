/**
 * vNext.13.4 — 제안 패킷은 COS sidecar + 경계 검증에서만 파생 (founder 원문 regex 분류 제거).
 * 레거시 `buildProposalFromFounderInput` 는 회귀용 얕은 래퍼(COS_ONLY 고정)만 유지한다.
 */

import { emptyProposalPacket, formatProposalPacketForSlack } from './founderProposalPacket.js';
import { buildFounderApprovalPacket } from './founderApprovalPacket.js';
import { emptySidecarFromPartner } from './founderArtifactSchemas.js';

/**
 * @param {object} sidecar normalized planner sidecar
 * @param {Record<string, unknown>} contextFrame
 * @param {string} rawUserText
 * @param {{ source?: string }} [opts]
 */
export function buildProposalPacketFromSidecar(sidecar, contextFrame, rawUserText, opts = {}) {
  const t = String(rawUserText || '').trim();
  const p = emptyProposalPacket();
  const traceReasons = ['sidecar', String(sidecar?.conversation_status || 'unknown'), opts.source || 'kernel'].filter(
    Boolean,
  );

  p.context_assumptions = [];
  const goalHint = contextFrame?.goal_line_hint ? String(contextFrame.goal_line_hint).trim() : '';
  const northStar =
    (contextFrame?.north_star_hint && String(contextFrame.north_star_hint).trim()) ||
    (contextFrame?.state_snapshot?.north_star && String(contextFrame.state_snapshot.north_star).trim()) ||
    '';
  const successHint = contextFrame?.success_condition_hint
    ? String(contextFrame.success_condition_hint).trim()
    : '';
  if (goalHint) p.context_assumptions.push(`기존 프로젝트·인테이크 목표(우선): ${goalHint}`);
  if (northStar && northStar !== goalHint) p.context_assumptions.push(`북극성·우선순위: ${northStar}`);
  if (successHint) p.context_assumptions.push(`성공 조건 힌트: ${successHint}`);
  const tx = contextFrame?.transcript_excerpt ? String(contextFrame.transcript_excerpt).trim() : '';
  if (tx) {
    const tail = tx.length > 220 ? `…${tx.slice(-220)}` : tx;
    p.context_assumptions.push(`최근 대화 발췌(보조): ${tail}`);
  }
  if (contextFrame?.recent_decisions?.length) {
    p.context_assumptions.push(`최근 합의(상태 정본): ${contextFrame.recent_decisions.slice(-5).join(' · ')}`);
  }
  if (contextFrame?.pending_confirmations?.length) {
    p.context_assumptions.push(`미결 확인: ${contextFrame.pending_confirmations.join(' · ')}`);
  }
  if (contextFrame?.scope_lock_status) {
    p.context_assumptions.push(`스코프 상태: ${contextFrame.scope_lock_status}`);
  }
  if (contextFrame?.constraints?.length) {
    p.context_assumptions.push(`운영 제약: ${contextFrame.constraints.join(' · ')}`);
  }
  if (contextFrame?.has_run) {
    p.context_assumptions.push('이 스레드에 활성 실행 런이 있습니다.');
  } else {
    p.context_assumptions.push('실행 스파인은 COS 구조화 아티팩트 승인 후에만 붙습니다.');
  }

  const pa = sidecar?.proposal_artifact && typeof sidecar.proposal_artifact === 'object' ? sidecar.proposal_artifact : {};
  p.understood_request =
    String(pa.understood_request || pa.headline || '').trim() ||
    (t ? `이번 턴 발화: 「${t.slice(0, 500)}${t.length > 500 ? '…' : ''}」` : '빈 입력입니다.');
  if (Array.isArray(pa.cos_only_tasks)) p.cos_only_tasks.push(...pa.cos_only_tasks.map((x) => String(x)));
  if (Array.isArray(pa.internal_support_tasks)) {
    p.internal_support_tasks.push(...pa.internal_support_tasks.map((x) => String(x)));
  }
  if (Array.isArray(pa.open_questions)) p.open_questions.push(...pa.open_questions.map((x) => String(x)));
  if (Array.isArray(sidecar?.follow_up_questions)) {
    p.open_questions.push(...sidecar.follow_up_questions.map((x) => String(x)));
  }

  const aa = sidecar?.approval_artifact && typeof sidecar.approval_artifact === 'object' ? sidecar.approval_artifact : {};
  if (aa.requires_external_dispatch === true && Array.isArray(aa.external_tasks)) {
    for (const x of aa.external_tasks) p.external_execution_tasks.push(String(x));
    p.approval_required = true;
    p.approval_reason = String(aa.rationale || 'COS sidecar: 외부 실행 후보');
  }

  if (!p.cos_only_tasks.length) {
    p.cos_only_tasks.push('대화 맥락을 바탕으로 COS가 정리·초안·되물음을 이어 갑니다.');
  }

  p.proposed_roadmap = [
    '① 대화로 의미 정렬 → ② 필요 시 구조화 제안 → ③ 승인 아티팩트 → ④ 실행 아티팩트로 스파인 연결 → ⑤ truth_reconciliation',
  ];
  p.proposed_deliverables = ['스레드에 남는 COS 답변', '구조화 필드는 내부 sidecar·상태에 적재'];
  p.expected_impact.push('원문만으로 실행 런을 만들지 않습니다.');
  p.risks.push('모호하면 COS가 되물음으로 좁힙니다.');

  const auth = contextFrame?.external_execution_authorization_state;
  let contract = 'COS_ONLY';
  if (p.external_execution_tasks.length > 0) {
    contract = auth === 'authorized' ? 'EXECUTION_READY' : 'APPROVAL_REQUIRED';
    traceReasons.push(contract);
  } else {
    traceReasons.push('contract_cos_only');
  }

  p.proposal_execution_contract = contract;
  p.proposal_contract_trace = { reasons: [...new Set(traceReasons)] };

  return p;
}

/**
 * 회귀·하드 리커버용: **regex 분류 없음** — 항상 COS_ONLY.
 * @param {{ rawText: string, contextFrame: Record<string, unknown> }} args
 */
export function buildProposalFromFounderInput({ rawText, contextFrame }) {
  const t = String(rawText || '').trim();
  const sidecar = emptySidecarFromPartner('');
  sidecar.conversation_status = 'exploring';
  sidecar.proposal_artifact = {
    understood_request: t
      ? `원문(레거시 셈): 「${t.slice(0, 400)}${t.length > 400 ? '…' : ''}」`
      : '빈 입력',
    open_questions: t ? [] : ['이번 턴 목표를 한 문장만 알려주세요.'],
  };
  return buildProposalPacketFromSidecar(sidecar, contextFrame, rawText, { source: 'legacy_raw_shim' });
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
