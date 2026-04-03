/**
 * vNext.13.2 — Launch gate 전용 승인·경계 문구 (core policy/renderer 비의존).
 */

/**
 * 런 생성 직후에도 외부 디스패치는 승인 후에만 시작됨을 명시.
 */
export function formatLaunchGateApprovalBoundaryLines() {
  return [
    '*승인 경계 (실행 준비 패킷)*',
    '- *이 범위로 실행 승인 부탁드립니다* — 승인 전에는 GitHub/Cursor/Supabase/배포로의 자동 디스패치를 시작하지 않습니다.',
    '- 승인 후에만 「실행을 시작했습니다」에 해당하는 오케스트레이션 디스패치가 진행됩니다.',
    '- *보류* 시: 내부 초안·정리·이 스레드 대화만 유지합니다.',
    '- *배포·프로덕션 반영*은 최종 kill point — 별도 확인 없이 진행하지 않습니다.',
    '*예상 딜리버러블 (승인 시):* 툴 ref·핸드오프·reconciliation에 남는 경로',
    '*롤백 / kill point:* 승인 전 outbound는 not_started 유지 → 외부 상태 추가 변경 없음',
  ].join('\n');
}

/**
 * COS가 직접 문서·대화로 끝내지 않고 외부 실행이 필요하다고 볼 때 (제안/승인 패킷과 동일 언어).
 * @param {{ reason?: string }} [opts]
 */
export function formatWhyExternalExecutionNeeded(opts = {}) {
  const r =
    opts.reason ||
    '코드 저장소·원격 개발 환경·DB 스키마 등 외부 시스템의 상태를 바꾸는 작업이 합의 범위에 포함되었기 때문입니다.';
  return `*왜 COS_ONLY로 끝내지 않고 external execution이 필요한가:* ${r}`;
}
