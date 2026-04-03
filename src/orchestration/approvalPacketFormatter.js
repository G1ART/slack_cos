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
 * }} opts
 * @returns {string}
 */
export function formatExternalApprovalPacketLines(opts = {}) {
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
  const draftAlt =
    opts.draft_alternative ||
    '외부 연결 없이 초안·메모·내부 아티팩트만 생성하는 대안을 선택할 수 있습니다.';

  return [
    '*외부 실행 승인 요약*',
    `*대상 시스템:* ${systems}`,
    '*예상 액션:*',
    actions,
    '*예상 딜리버러블:*',
    deliv,
    '*롤백 / 중단점:*',
    rollback,
    `*드래프트 전용 대안:* ${draftAlt}`,
  ].join('\n');
}
