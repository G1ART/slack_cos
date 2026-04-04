/**
 * vNext.13.4 — COS sidecar / execution artifact 스키마 (코드는 검증·경계만).
 */

/** OpenAI responses json_schema strict — 모든 property required */
export const FOUNDER_CONVERSATION_PLANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    natural_language_reply: {
      type: 'string',
      description: '대표에게 보이는 COS 평문 답변(한국어).',
    },
    state_delta: {
      type: 'object',
      additionalProperties: true,
      description: 'durable state에 병합할 델타',
    },
    conversation_status: {
      type: 'string',
      enum: ['exploring', 'narrowing', 'scope_locked', 'approval_pending', 'execution_ready'],
    },
    proposal_artifact: {
      type: 'object',
      additionalProperties: true,
      description: '제안 패킷 렌더 입력(비어 있으면 생략)',
    },
    approval_artifact: {
      type: 'object',
      additionalProperties: true,
      description: '외부 실행 승인 후보(비어 있으면 승인 패킷 없음)',
    },
    execution_artifact: {
      type: 'object',
      additionalProperties: true,
      description: '실행 스파인 요청(비어 있으면 미요청)',
    },
    follow_up_questions: {
      type: 'array',
      items: { type: 'string' },
    },
    requires_founder_confirmation: { type: 'boolean' },
  },
  required: [
    'natural_language_reply',
    'state_delta',
    'conversation_status',
    'proposal_artifact',
    'approval_artifact',
    'execution_artifact',
    'follow_up_questions',
    'requires_founder_confirmation',
  ],
};

/**
 * @param {unknown} row
 * @returns {{ ok: boolean, sidecar?: object, error?: string }}
 */
export function normalizePlannerRow(row) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'not_object' };
  const r = /** @type {Record<string, unknown>} */ (row);
  return {
    ok: true,
    sidecar: {
      natural_language_reply: String(r.natural_language_reply || '').trim(),
      state_delta: r.state_delta && typeof r.state_delta === 'object' ? r.state_delta : {},
      conversation_status: String(r.conversation_status || 'exploring'),
      proposal_artifact: r.proposal_artifact && typeof r.proposal_artifact === 'object' ? r.proposal_artifact : {},
      approval_artifact: r.approval_artifact && typeof r.approval_artifact === 'object' ? r.approval_artifact : {},
      execution_artifact: r.execution_artifact && typeof r.execution_artifact === 'object' ? r.execution_artifact : {},
      follow_up_questions: Array.isArray(r.follow_up_questions) ? r.follow_up_questions.map((x) => String(x)) : [],
      requires_founder_confirmation: Boolean(r.requires_founder_confirmation),
    },
  };
}

/**
 * @param {unknown} a
 */
export function validateExecutionArtifactForSpine(a) {
  if (!a || typeof a !== 'object') return { ok: false, reason: 'not_object' };
  const x = /** @type {Record<string, unknown>} */ (a);
  if (x.request_execution_spine !== true) return { ok: false, reason: 'not_requested' };
  if (x.approval_lineage_confirmed !== true) return { ok: false, reason: 'lineage' };
  if (!String(x.goal_line || '').trim()) return { ok: false, reason: 'goal' };
  if (!String(x.locked_scope_summary || '').trim()) return { ok: false, reason: 'scope' };
  return { ok: true };
}

/**
 * @param {object} sidecar
 * @param {string} fallbackNatural
 */
export function emptySidecarFromPartner(fallbackNatural) {
  return {
    natural_language_reply: String(fallbackNatural || '').trim(),
    state_delta: {},
    conversation_status: 'exploring',
    proposal_artifact: {},
    approval_artifact: {},
    execution_artifact: {},
    follow_up_questions: [],
    requires_founder_confirmation: false,
  };
}
