/**
 * vNext.13.4 — COS sidecar / execution artifact 스키마 (코드는 검증·경계만).
 * vNext.13.5 — lineage preview + state cross-check (boolean self-claim 금지).
 */

import { previewMergeFounderConversationState } from './founderConversationState.js';

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
 * sidecar state_delta + proposal/approval의 _cos_artifact_id 를 한 델타로 합친다.
 * @param {Record<string, unknown>} delta
 * @param {object} sidecar
 */
export function mergeStateDeltaWithSidecarArtifactIds(delta, sidecar) {
  const d = { ...(delta && typeof delta === 'object' ? delta : {}) };
  const pa = sidecar?.proposal_artifact;
  const aa = sidecar?.approval_artifact;
  if (pa && typeof pa === 'object' && typeof pa._cos_artifact_id === 'string' && pa._cos_artifact_id.trim()) {
    d.latest_proposal_artifact_id = pa._cos_artifact_id.trim();
  }
  if (aa && typeof aa === 'object' && typeof aa._cos_artifact_id === 'string' && aa._cos_artifact_id.trim()) {
    d.latest_approval_artifact_id = aa._cos_artifact_id.trim();
  }
  return d;
}

/**
 * @param {object} convStateBeforeTurn getFounderConversationState 결과
 * @param {object} sidecar planner sidecar (state_delta는 이미 아이디 병합 권장)
 */
export function buildFounderLineagePreview(convStateBeforeTurn, sidecar) {
  const mergedDelta = mergeStateDeltaWithSidecarArtifactIds(sidecar.state_delta || {}, sidecar);
  return previewMergeFounderConversationState(convStateBeforeTurn, mergedDelta);
}

/**
 * @param {unknown} a execution_artifact
 * @param {object | null | undefined} lineagePreview buildFounderLineagePreview(...)
 */
export function validateExecutionArtifactForSpine(a, lineagePreview) {
  if (!a || typeof a !== 'object') return { ok: false, reason: 'not_object' };
  const x = /** @type {Record<string, unknown>} */ (a);
  if (x.request_execution_spine !== true) return { ok: false, reason: 'not_requested' };
  if (!String(x.goal_line || '').trim()) return { ok: false, reason: 'goal' };
  if (!String(x.locked_scope_summary || '').trim()) return { ok: false, reason: 'scope' };

  if (!lineagePreview || typeof lineagePreview !== 'object') {
    return { ok: false, reason: 'no_lineage_preview' };
  }
  const lp = String(lineagePreview.latest_proposal_artifact_id || '').trim();
  const la = String(lineagePreview.latest_approval_artifact_id || '').trim();
  const srcP = String(x.source_proposal_artifact_id || '').trim();
  const srcA = String(x.source_approval_artifact_id || '').trim();
  if (!srcP || !srcA) return { ok: false, reason: 'missing_lineage_ref' };
  if (!lp || !la) return { ok: false, reason: 'state_missing_artifact_ids' };
  if (srcP !== lp || srcA !== la) return { ok: false, reason: 'lineage_id_mismatch' };

  const confAt = String(lineagePreview.last_founder_confirmation_at || '').trim();
  if (!confAt) return { ok: false, reason: 'no_founder_confirmation' };
  if (String(lineagePreview.approval_lineage_status || '').trim() !== 'confirmed') {
    return { ok: false, reason: 'lineage_not_confirmed' };
  }

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
