/**
 * vNext.13 — 대표에게 보이는 외부 실행 승인 패킷 서술(텍스트만).
 */

/**
 * @param {{
 *   systems?: string[],
 *   actions?: string[],
 *   deliverables?: string[],
 *   rollback?: string[],
 *   draft_alternative?: string,
 *   why_not_cos_only?: string,
 *   changing_systems_detail?: string,
 *   if_not_approved_draft_path?: string,
 * }} opts
 * @returns {string}
 */
export function formatExternalApprovalPacketLines(opts = {}) {
  const whyCos =
    opts.why_not_cos_only ||
    'Slack 대화와 COS_ONLY 초안만으로는 GitHub/Cursor/Supabase 등 외부 시스템의 실제 상태를 바꿀 수 없고, 합의된 범위를 툴체인에 반영하려면 명시적 실행 단계가 필요하기 때문입니다.';
  const changing =
    opts.changing_systems_detail ||
    '위 대상 시스템의 저장소·브랜치·이슈/PR·원격 작업공간·DB 스키마/마이그레이션·(해당 시) 프리뷰 배포 설정 등';
  const draftPath =
    opts.if_not_approved_draft_path ||
    opts.draft_alternative ||
    '외부 연결 없이 초안·메모·내부 아티팩트만 유지합니다. 승인 없이 디스패치는 시작하지 않습니다.';

  const sysArr = Array.isArray(opts.systems) && opts.systems.length ? opts.systems : ['GitHub', 'Cursor Cloud', 'Supabase', 'Vercel/Railway'];
  const systems = sysArr.join(', ');
  const actions = (opts.actions || [
    '이슈/브랜치/PR 시드',
    'Cursor handoff 또는 실행 참조',
    '스키마 초안·마이그레이션 스텁',
    '프리뷰/관측 배포 패킷',
  ]).map((a) => `• ${a}`).join('\n');
  const deliv = (opts.deliverables || ['경로가 기록된 아티팩트', 'truth_reconciliation에 반영될 툴 ref']).map((d) => `• ${d}`).join('\n');
  const rollback = (opts.rollback || [
    '디스패치 전: outbound_dispatch_state가 not_started이면 추가 변화 없음',
    '배포 레이어는 최종 kill point — 프로덕션 반영은 별도 대표 확인',
  ]).map((r) => `• ${r}`).join('\n');
  const draftAlt = draftPath;

  return [
    '*외부 실행 승인 요약 (결제 표면)*',
    '*1. 왜 COS_ONLY로 끝내지 않고 external execution이 필요한가*',
    whyCos,
    '*2. 바뀌는 external system*',
    changing,
    `*3. 대상 시스템(요약):* ${systems}`,
    '*4. 예상 액션:*',
    actions,
    '*5. 예상 아티팩트 / 딜리버러블:*',
    deliv,
    '*6. rollback / kill point:*',
    rollback,
    '*7. 승인을 하지 않으면 남는 draft-only 대안:*',
    draftAlt,
  ].join('\n');
}
