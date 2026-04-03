/**
 * vNext.13 — 외부 실행 작업이 있을 때만 대표용 승인 섹션을 붙인다.
 */

import { formatExternalApprovalPacketLines } from '../orchestration/approvalPacketFormatter.js';

/**
 * @param {{ external_execution_tasks?: string[], approval_required?: boolean, approval_reason?: string }} proposal
 * @returns {{ visible_section: string, internal_note: string }}
 */
export function buildFounderApprovalPacket(proposal) {
  const tasks = proposal?.external_execution_tasks || [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { visible_section: '', internal_note: 'no_external_tasks' };
  }

  const visible_section = [
    formatExternalApprovalPacketLines({
      actions: tasks.map((t) => String(t)),
    }),
    proposal?.approval_reason ? `*승인이 필요한 이유:* ${proposal.approval_reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    visible_section,
    internal_note: 'external_execution_pending_founder_approval',
  };
}
