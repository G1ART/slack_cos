/**
 * vNext.13.2 — Launch gate 창업자 표면 전용 텍스트 (founderRenderer / policy 비사용).
 * 제안 패킷과 동일한 언어 축: 이해한 범위 · COS · 하네스 · 외부 · 승인 · 딜리버러블 · rollback/kill point.
 */

import { formatLaunchGateApprovalBoundaryLines, formatWhyExternalExecutionNeeded } from './founderLaunchApprovalPacket.js';

/**
 * @param {Record<string, unknown>} payload — `buildExecutionLaunchRenderPayload` 결과
 * @returns {{ text: string, blocks?: object[] }}
 */
export function formatFounderLaunchExecutionSurface(payload) {
  const lines = [];

  lines.push('*[COS 실행 준비 패킷]*');
  lines.push('*1. 제가 이해한 실행 범위*');
  if (payload.goal_line) lines.push(`- 목표: ${payload.goal_line}`);
  if (payload.locked_scope_summary) lines.push(`- 잠금 요약: ${payload.locked_scope_summary}`);
  if (payload.readiness_state) lines.push(`- 준비도 판정: ${payload.readiness_state}`);

  lines.push('*2. 지금 바로 COS가 정리할 일*');
  lines.push('- 이 스레드에서 범위·리스크·다음 질문을 문장으로 고정하고, 승인 전에는 외부 상태를 바꾸지 않습니다.');

  lines.push('*3. 하네스가 맡을 일 (승인 후 플랜 반영)*');
  const imm = payload.immediate_actions?.length
    ? payload.immediate_actions.map((a) => `- ${a}`).join('\n')
    : '- (오케스트레이션·플래너가 승인 범위에 맞춰 배정)';
  lines.push(imm);

  lines.push('*4. 외부 시스템을 실제로 바꿀 일 (승인 후)*');
  lines.push(
    '- GitHub / Cursor Cloud / Supabase / (필요 시) 프리뷰 배포 등 — *승인이 있으면* 해당 범위만 디스패치합니다.',
  );
  lines.push(formatWhyExternalExecutionNeeded({}));

  lines.push('*5. 승인 필요 여부*');
  lines.push('- *필요합니다.* 런이 생성되었어도 authorized 전까지 외부 mutation은 시작하지 않습니다.');

  lines.push('*6. 예상 deliverables / rollback / kill point*');
  lines.push(`- *Deliverables:* 승인 시 툴 ref·핸드오프·truth_reconciliation 요약이 스파인에 쌓입니다.`);
  lines.push('- *Rollback:* 승인 전 outbound not_started → 외부 추가 변경 없음.');
  lines.push('- *Kill point:* 프로덕션·최종 배포는 별도 대표 확인.');

  lines.push(formatLaunchGateApprovalBoundaryLines());

  if (payload.project_space_resolution_mode) {
    lines.push(`*프로젝트 space 결선:* \`${payload.project_space_resolution_mode}\``);
  }
  if (payload.founder_facing_space_note) {
    lines.push(`_${payload.founder_facing_space_note}_`);
  }

  const ps = payload.project_space;
  if (ps?.id || ps?.label) {
    lines.push(`*프로젝트 스페이스:* id \`${ps.id || '-'}\` · label ${ps.label || '-'}`);
  }

  const rs = payload.run_summary || {};
  const rid = payload.run_id || rs.run_id;
  if (rid || rs.stage || rs.status) {
    lines.push(`*Run:* \`${rid || '-'}\` · stage ${rs.stage || '-'} · status ${rs.status || '-'}`);
  }
  if (payload.packet_id) lines.push(`*packet_id:* \`${payload.packet_id}\``);

  lines.push(
    `*워크스트림:*\n${payload.workstreams?.length ? payload.workstreams.map((w) => `- ${w}`).join('\n') : '- (시드 대기)'}`,
  );
  lines.push(
    `*provider truth:*\n${payload.provider_truth?.length ? payload.provider_truth.map((t) => `- ${t}`).join('\n') : '- (스냅샷 없음)'}`,
  );
  if (payload.provider_truth_friendly?.length) {
    lines.push(
      `*provider 상태 해석:*\n${payload.provider_truth_friendly.map((t) => `- ${t}`).join('\n')}`,
    );
  }

  const native = payload.provider_native_refs;
  if (native && typeof native === 'object') {
    const nlines = [];
    if (native.github_issue_url) nlines.push(`GitHub issue: ${native.github_issue_url}`);
    if (native.github_pr_url) nlines.push(`GitHub PR: ${native.github_pr_url}`);
    if (native.cursor_run_ref) nlines.push(`Cursor run_ref: \`${native.cursor_run_ref}\``);
    if (native.cursor_conversation_url) nlines.push(`Cursor conversation: ${native.cursor_conversation_url}`);
    if (native.cursor_branch_name) nlines.push(`Cursor branch: \`${native.cursor_branch_name}\``);
    if (native.supabase_draft_path) nlines.push(`Supabase draft: \`${native.supabase_draft_path}\``);
    if (native.supabase_migration_path) nlines.push(`Supabase migration: \`${native.supabase_migration_path}\``);
    if (native.supabase_live_apply_ref) nlines.push(`Supabase apply_ref: \`${native.supabase_live_apply_ref}\``);
    if (native.supabase_dispatch_target) {
      nlines.push(
        `Supabase dispatch: \`${native.supabase_dispatch_target}\` · safe_target=${native.supabase_safe_target || 'unknown'}`,
      );
    }
    if (nlines.length) {
      lines.push(`*provider 네이티브 참조:*\n${nlines.map((l) => `- ${l}`).join('\n')}`);
    }
  }

  const autoStarted = payload.auto_started_artifacts?.length
    ? payload.auto_started_artifacts.map((a) => `- ${a}`).join('\n')
    : '- (승인 전이거나 경로 미기록)';
  lines.push(`*자동 생성·디스패치된 산출물:*\n${autoStarted}`);

  const bridges = payload.manual_bridge_actions?.length
    ? payload.manual_bridge_actions.map((b) => `- ${b}`).join('\n')
    : '- (별도 수동 브리지 없음)';
  lines.push(`*수동 브리지 필요 항목:*\n${bridges}`);

  lines.push(
    `*적용된 기본값:*\n${payload.defaults_applied?.length ? payload.defaults_applied.map((d) => `- ${d}`).join('\n') : '- (없음)'}`,
  );

  if (payload.blocker) lines.push(`*blocker:* ${payload.blocker}`);
  if (payload.founder_next_action) {
    lines.push(`*대표 next action:* ${payload.founder_next_action}`);
  }

  return { text: lines.join('\n\n'), blocks: payload.blocks };
}

/**
 * @param {{ blockers?: string[], readiness?: string, founder_next_action?: string }} payload
 */
export function formatFounderLaunchBlockedSurface(payload) {
  const lines = [
    '*[COS 실행 준비 — 보류]*',
    '*1. 제가 이해한 실행 범위*',
    '- 아직 scope·목표 한 줄이 부족해 실행 패킷으로 넘기기 어렵습니다.',
    '*2. 지금 바로 COS가 정리할 일*',
    '- 목표를 한 문장으로 좁히고, 블로커를 Slack에서 먼저 해소합니다.',
    '*3. 외부 시스템*',
    '- *이 단계에서는 외부 mutation 없음* (승인·런 생성 전).',
    `*판정:* ${payload.readiness || '-'}`,
  ];
  if (payload.blockers?.length) {
    lines.push(`*블로커*\n${payload.blockers.map((b) => `- ${b}`).join('\n')}`);
  }
  lines.push(`*대표 next action*\n${payload.founder_next_action || '목표를 한 줄로 보내 주세요.'}`);
  return { text: lines.join('\n\n') };
}
