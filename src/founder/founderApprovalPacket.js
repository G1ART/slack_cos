/**
 * vNext.13.1 — `external_execution_tasks`가 있을 때만 승인 패킷(유일한 외부 실행 입구 표면).
 */

import { formatExternalApprovalPacketLines } from '../orchestration/approvalPacketFormatter.js';

/**
 * @param {string} hay
 * @returns {string[]}
 */
function systemsFromTaskHaystack(hay) {
  const systems = [];
  if (/github|깃허브|PR|브랜치|이슈/i.test(hay)) systems.push('GitHub');
  if (/cursor|커서/i.test(hay)) systems.push('Cursor Cloud');
  if (/supabase/i.test(hay)) systems.push('Supabase');
  if (/vercel|railway|배포|프리뷰|프로덕션/i.test(hay)) systems.push('Vercel/Railway');
  return systems.length ? systems : ['(요약된 툴체인 — 승인 후 구체화)'];
}

/**
 * @param {{ external_execution_tasks?: string[], approval_required?: boolean, approval_reason?: string }} proposal
 * @returns {{ visible_section: string, internal_note: string }}
 */
export function buildFounderApprovalPacket(proposal) {
  const tasks = proposal?.external_execution_tasks || [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { visible_section: '', internal_note: 'no_external_tasks' };
  }

  const hay = tasks.map((t) => String(t)).join('\n');
  const systems = systemsFromTaskHaystack(hay);
  const actionLines = tasks.map((t) => String(t));

  const visible_section = [
    formatExternalApprovalPacketLines({
      systems,
      actions: actionLines,
      why_not_cos_only:
        proposal?.approval_reason ||
        '외부 저장소·원격 개발 환경·DB 등 실제 상태 변경이 요청에 포함되어 COS_ONLY 대화만으로는 완료할 수 없습니다.',
      changing_systems_detail: systems,
      deliverables: [
        '툴 ref·핸드오프 경로·reconciliation에 남는 산출 요약',
        '승인 범위 밖 작업은 디스패치하지 않음',
      ],
      rollback: [
        '롤백: 승인 전 outbound_dispatch_state not_started 유지 — 외부 상태 추가 변경 없음',
        '중단점(kill point): 배포·프로덕션 반영은 최종 단계, 별도 대표 확인',
        '승인 철회·보류 시 내부 초안만 유지',
      ],
      draft_alternative:
        '외부 연결 없이 초안·메모·내부 아티팩트만 생성 — 승인 옵션에서 「드래프트만」에 해당',
      if_not_approved_draft_path:
        '승인·보류 시: *내부 초안·정리만 유지합니다* — external dispatch는 시작하지 않습니다.',
    }),
    '',
    '*승인 전 문구 규칙:* 승인 전에는 즉시 실행을 약속하는 표현 대신 *이 범위로 실행 승인 부탁드립니다*. 승인 후에만 디스패치를 개시한다고 안내합니다.',
    '',
    '*승인 옵션 (Slack에서 문장으로 회신):* `승인` · `드래프트만` · `범위 줄이기` · `다시 정리` · `보류`',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    visible_section,
    internal_note: 'external_execution_pending_founder_approval',
  };
}
